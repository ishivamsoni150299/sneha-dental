import nodemailer from 'nodemailer';

export type EmailTemplate =
  | 'welcome'
  | 'appointment_request_received'
  | 'appointment_request_declined'
  | 'appointment_request_expired'
  | 'clinic_booking_alert'
  | 'appointment_confirmation'
  | 'appointment_reminder';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createTransporter() {
  const user = process.env['ZOHO_SMTP_USER'];
  const pass = process.env['ZOHO_SMTP_PASS'];
  if (!user || !pass) throw new Error('ZOHO_SMTP_USER / ZOHO_SMTP_PASS not configured');

  return nodemailer.createTransport({
    host: 'smtp.zoho.in',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

function buildEmail(template: EmailTemplate, data: Record<string, string>) {
  data = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, escapeHtml(String(value ?? ''))]),
  );
  const from = `mydentalplatform <${process.env['ZOHO_SMTP_USER'] ?? 'mydentalplatform@zohomail.in'}>`;
  const support = 'mydentalplatform@zohomail.in';

  switch (template) {
    case 'welcome':
      return {
        from,
        subject: `Your dental website is live - ${data['clinicName']}`,
        html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:0">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="background:linear-gradient(135deg,#2563eb,#1e3a8a);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:24px;font-weight:800">Your website is live!</h1>
    <p style="color:#bfdbfe;margin:8px 0 0;font-size:14px">${data['clinicName']}</p>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:15px;margin:0 0 20px">Hi ${data['doctorName'] || 'Doctor'},</p>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 20px">
      Congratulations! <strong>${data['clinicName']}</strong> is now live on mydentalplatform.
      Your patients can book appointments online 24/7.
    </p>
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:20px;margin:0 0 24px">
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#0369a1;text-transform:uppercase;letter-spacing:.05em">Your details</p>
      <table style="width:100%;font-size:13px;color:#374151;border-collapse:collapse">
        <tr><td style="padding:4px 0;color:#6b7280;width:120px">Website</td><td><a href="${data['siteUrl']}" style="color:#2563eb;font-weight:600">${data['siteUrl']}</a></td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Admin panel</td><td><a href="${data['adminUrl']}" style="color:#2563eb;font-weight:600">${data['adminUrl']}</a></td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Login email</td><td style="font-weight:600">${data['email']}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Plan</td><td style="font-weight:600">${data['planLabel']}</td></tr>
      </table>
    </div>
    <p style="color:#374151;font-size:14px;font-weight:700;margin:0 0 12px">What to do next:</p>
    <ol style="color:#374151;font-size:14px;line-height:1.8;margin:0 0 24px;padding-left:20px">
      <li>Open your website and try booking a test appointment</li>
      <li>Log into your admin dashboard to manage bookings</li>
      <li>Share your website link on WhatsApp with existing patients</li>
    </ol>
    <a href="${data['adminUrl']}" style="display:block;background:#2563eb;color:#fff;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">Go to admin dashboard -&gt;</a>
  </div>
  <div style="background:#f8fafc;padding:20px;text-align:center;font-size:12px;color:#9ca3af">
    Questions? Reply to this email or WhatsApp us at ${data['supportPhone'] || '+91-XXXXXXXXXX'}.<br>
    <a href="mailto:${support}" style="color:#6b7280">${support}</a>
  </div>
</div></body></html>`,
      };

    case 'appointment_confirmation':
      return {
        from,
        subject: `Appointment confirmed - ${data['clinicName']}`,
        html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:0">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="background:linear-gradient(135deg,#10b981,#047857);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800">Appointment Confirmed</h1>
    <p style="color:#a7f3d0;margin:8px 0 0;font-size:14px">${data['clinicName']}</p>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:14px;margin:0 0 20px">Hi ${data['patientName']},</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:0 0 24px">
      <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#6b7280;width:120px">Booking ref</td><td style="font-weight:700;color:#059669">${data['bookingRef']}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Service</td><td style="font-weight:600">${data['service']}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Date</td><td style="font-weight:600">${data['date']}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Time</td><td style="font-weight:600">${data['time']}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Clinic</td><td>${data['clinicName']}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Address</td><td>${data['address']}</td></tr>
      </table>
    </div>
    <p style="font-size:12px;color:#9ca3af;text-align:center">
      Save your booking ref <strong>${data['bookingRef']}</strong> to reschedule or cancel.<br>
      Call ${data['phone']} if you need to make changes within 24 hours.
    </p>
  </div>
</div></body></html>`,
      };

    case 'appointment_request_received':
      return {
        from,
        subject: `Appointment request received - ${data['clinicName']}`,
        html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:0">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="background:linear-gradient(135deg,#2563eb,#1e3a8a);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800">Request received</h1>
    <p style="color:#bfdbfe;margin:8px 0 0;font-size:14px">${data['clinicName']}</p>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:14px;margin:0 0 20px">Hi ${data['patientName']},</p>
    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 20px">Your appointment request is saved. The clinic will confirm the final slot by call or WhatsApp.</p>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px;margin:0 0 24px">
      <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#6b7280;width:120px">Booking ref</td><td style="font-weight:700;color:#1d4ed8">${data['bookingRef']}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Service</td><td style="font-weight:600">${data['service']}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Preferred date</td><td style="font-weight:600">${data['date']}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Preferred time</td><td style="font-weight:600">${data['time']}</td></tr>
      </table>
    </div>
    <p style="font-size:12px;color:#64748b;text-align:center;line-height:1.6">This is a request, not a confirmed clinical appointment. For urgent dental pain, call ${data['phone']} directly.</p>
  </div>
</div></body></html>`,
      };

    case 'appointment_request_declined':
      return {
        from,
        subject: `Appointment request update - ${data['clinicName']}`,
        html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:0">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="background:#881337;padding:28px 32px"><h1 style="color:#fff;margin:0;font-size:22px">Requested time unavailable</h1></div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:14px">Hi ${data['patientName']},</p>
    <p style="color:#374151;font-size:14px;line-height:1.6">${data['clinicName']} could not confirm your requested appointment time.</p>
    <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:18px;margin:20px 0;font-size:14px;color:#374151">
      <strong>Reason:</strong> ${data['reason'] || 'The requested time is unavailable.'}<br>
      <strong>Booking ref:</strong> ${data['bookingRef']}
    </div>
    <p style="font-size:13px;color:#64748b">No payment was taken. Call ${data['phone']} or return to mydentalplatform to request another time.</p>
  </div>
</div></body></html>`,
      };

    case 'appointment_request_expired':
      return {
        from,
        subject: `Appointment request expired - ${data['clinicName']}`,
        html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:0">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="background:#334155;padding:28px 32px"><h1 style="color:#fff;margin:0;font-size:22px">Request window ended</h1></div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:14px">Hi ${data['patientName']},</p>
    <p style="color:#374151;font-size:14px;line-height:1.6">${data['clinicName']} did not confirm your preferred time within the response window, so the request was released.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin:20px 0;font-size:14px;color:#374151">
      <strong>Booking ref:</strong> ${data['bookingRef']}<br>
      <strong>Requested:</strong> ${data['date']} at ${data['time']}<br>
      <strong>Service:</strong> ${data['service']}
    </div>
    <p style="font-size:13px;color:#64748b">No payment was taken. You can request another clinic or call ${data['phone']} directly.</p>
  </div>
</div></body></html>`,
      };

    case 'clinic_booking_alert':
      return {
        from,
        subject: `New booking request - ${data['patientName']} - ${data['date']}`,
        html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:0">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="background:#081424;padding:28px 32px">
    <p style="color:#67e8f9;margin:0 0 6px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em">New patient request</p>
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800">${data['patientName']} requested an appointment</h1>
  </div>
  <div style="padding:32px">
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:0 0 20px">
      <table style="width:100%;font-size:14px;color:#334155;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#64748b;width:120px">Phone</td><td style="font-weight:700">${data['patientPhone']}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Service</td><td>${data['service']}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Date</td><td>${data['date']}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Time</td><td>${data['time']}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Booking ref</td><td>${data['bookingRef']}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Notes</td><td>${data['message'] || 'None'}</td></tr>
      </table>
    </div>
    <a href="${data['dashboardUrl']}" style="display:block;background:#2563eb;color:#fff;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">Open clinic dashboard</a>
    <p style="font-size:12px;color:#94a3b8;text-align:center;margin:16px 0 0">Call or WhatsApp the patient to confirm the final slot.</p>
  </div>
</div></body></html>`,
      };

    case 'appointment_reminder':
      return {
        from,
        subject: `Reminder: your appointment tomorrow - ${data['clinicName']}`,
        html: `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:0">
<div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
  <div style="background:linear-gradient(135deg,#6366f1,#4338ca);padding:32px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:22px;font-weight:800">Appointment Tomorrow</h1>
    <p style="color:#c7d2fe;margin:8px 0 0;font-size:14px">${data['clinicName']}</p>
  </div>
  <div style="padding:32px">
    <p style="color:#374151;font-size:14px;margin:0 0 16px">Hi ${data['patientName']},</p>
    <p style="color:#374151;font-size:14px;margin:0 0 20px">
      Just a reminder that you have an appointment at <strong>${data['clinicName']}</strong> tomorrow.
    </p>
    <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:20px;margin:0 0 20px">
      <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse">
        <tr><td style="padding:4px 0;color:#6b7280;width:100px">Service</td><td style="font-weight:600">${data['service']}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Time</td><td style="font-weight:600">${data['time']}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280">Address</td><td>${data['address']}</td></tr>
      </table>
    </div>
    <p style="font-size:12px;color:#9ca3af;text-align:center">
      Need to cancel? Call <a href="tel:${data['phone']}" style="color:#4338ca">${data['phone']}</a> at least 24 hours before.
    </p>
  </div>
</div></body></html>`,
      };

    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

export async function sendEmail(template: EmailTemplate, to: string, data: Record<string, string>): Promise<boolean> {
  if (!to?.includes('@')) return false;

  try {
    const transporter = createTransporter();
    const { subject, html } = buildEmail(template, data);
    await transporter.sendMail({ from: `mydentalplatform <${process.env['ZOHO_SMTP_USER']}>`, to, subject, html });
    console.log(`[send-email] Sent ${template}`);
    return true;
  } catch (err) {
    console.error(`[send-email] Failed ${template}:`, err);
    throw err;
  }
}
