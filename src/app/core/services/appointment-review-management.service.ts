import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../firebase';

export type ReviewModerationStatus = 'pending' | 'published' | 'rejected';

export interface ManagedAppointmentReview {
  id: string;
  clinicId: string;
  rating: number;
  text: string;
  patientAlias: string;
  moderationStatus: ReviewModerationStatus;
  clinicResponse: string;
  createdAt: string | null;
  publishedAt: string | null;
}

export interface AppointmentReviewReport {
  id: string;
  reviewId: string;
  clinicId: string;
  reason: string;
  details: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class AppointmentReviewManagementService {
  async getModerationQueue(): Promise<ManagedAppointmentReview[]> {
    const snapshot = await getDocs(query(
      collection(db, 'appointmentReviews'),
      where('moderationStatus', '==', 'pending'),
      orderBy('createdAt', 'asc'),
      limit(100),
    ));
    return snapshot.docs.map(document => this.review(document));
  }

  async getOpenReports(): Promise<AppointmentReviewReport[]> {
    const snapshot = await getDocs(query(
      collection(db, 'appointmentReviewReports'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'asc'),
      limit(100),
    ));
    return snapshot.docs.map(document => this.report(document));
  }

  async moderate(reviewId: string, status: Exclude<ReviewModerationStatus, 'pending'>): Promise<void> {
    const reviewerUid = auth.currentUser?.uid;
    if (!reviewerUid) throw new Error('Platform administrator session required.');
    const reviewRef = doc(db, 'appointmentReviews', reviewId);
    const moderationRef = doc(db, 'appointmentReviewModeration', reviewId);
    await runTransaction(db, async transaction => {
      const [review, moderation] = await Promise.all([
        transaction.get(reviewRef),
        transaction.get(moderationRef),
      ]);
      if (!review.exists() || !moderation.exists()) throw new Error('Review moderation record is unavailable.');
      transaction.update(reviewRef, {
        moderationStatus: status,
        publishedAt: status === 'published' ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      });
      transaction.update(moderationRef, {
        status,
        reviewedBy: reviewerUid,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  }

  async resolveReport(reportId: string, status: 'resolved' | 'dismissed'): Promise<void> {
    const reviewerUid = auth.currentUser?.uid;
    if (!reviewerUid) throw new Error('Platform administrator session required.');
    await runTransaction(db, async transaction => {
      const reportRef = doc(db, 'appointmentReviewReports', reportId);
      const report = await transaction.get(reportRef);
      if (!report.exists() || report.data()['status'] !== 'pending') {
        throw new Error('This report is no longer pending.');
      }
      transaction.update(reportRef, {
        status,
        reviewedBy: reviewerUid,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  }

  async getClinicPublishedReviews(clinicId: string): Promise<ManagedAppointmentReview[]> {
    const snapshot = await getDocs(query(
      collection(db, 'appointmentReviews'),
      where('clinicId', '==', clinicId),
      where('moderationStatus', '==', 'published'),
      orderBy('publishedAt', 'desc'),
      limit(100),
    ));
    return snapshot.docs.map(document => this.review(document));
  }

  async respond(clinicId: string, reviewId: string, responseValue: string): Promise<void> {
    const response = responseValue.trim();
    if (response.length < 2 || response.length > 600) {
      throw new Error('Response must be between 2 and 600 characters.');
    }
    const reviewRef = doc(db, 'appointmentReviews', reviewId);
    await runTransaction(db, async transaction => {
      const review = await transaction.get(reviewRef);
      if (
        !review.exists() ||
        review.data()['clinicId'] !== clinicId ||
        review.data()['moderationStatus'] !== 'published'
      ) {
        throw new Error('This published review is unavailable.');
      }
      transaction.update(reviewRef, {
        clinicResponse: response,
        clinicRespondedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  }

  private review(document: QueryDocumentSnapshot<DocumentData>): ManagedAppointmentReview {
    const data = document.data();
    return {
      id: document.id,
      clinicId: this.text(data['clinicId'], 128),
      rating: Number(data['rating']),
      text: this.text(data['text'], 1200),
      patientAlias: this.text(data['patientAlias'], 48) || 'Verified patient',
      moderationStatus: data['moderationStatus'] as ReviewModerationStatus,
      clinicResponse: this.text(data['clinicResponse'], 600),
      createdAt: this.timestamp(data['createdAt']),
      publishedAt: this.timestamp(data['publishedAt']),
    };
  }

  private report(document: QueryDocumentSnapshot<DocumentData>): AppointmentReviewReport {
    const data = document.data();
    return {
      id: document.id,
      reviewId: this.text(data['reviewId'], 80),
      clinicId: this.text(data['clinicId'], 128),
      reason: this.text(data['reason'], 24),
      details: this.text(data['details'], 500),
      status: data['status'] as AppointmentReviewReport['status'],
      createdAt: this.timestamp(data['createdAt']),
    };
  }

  private text(value: unknown, max: number): string {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
  }

  private timestamp(value: unknown): string | null {
    if (!value || typeof value !== 'object' || !('toDate' in value)) return null;
    const toDate = value.toDate;
    if (typeof toDate !== 'function') return null;
    const date = toDate.call(value) as unknown;
    return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
}