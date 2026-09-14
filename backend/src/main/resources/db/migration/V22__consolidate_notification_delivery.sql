-- Preserve existing audit history while moving delivery to one durable queue.
alter table notification_outbox alter column idempotency_key type varchar(160);
-- Completed legacy sends must not be re-delivered after the worker changes.
update notification_outbox o set status = 'sent', processed_at = n.updated_at,
    updated_at = now()
from notifications n
where n.idempotency_key = o.idempotency_key and n.status = 'sent';

insert into notification_outbox
    (idempotency_key, clinic_id, appointment_id, notification_type, destination, subject,
     payload, status, attempts, created_at)
select idempotency_key, clinic_id, appointment_id, notification_type, destination,
    left(coalesce(data ->> 'subject', 'Appointment update'), 255), data, status, attempts, created_at
from notifications
where status in ('pending', 'failed') and data ? 'html'
on conflict (idempotency_key) do nothing;
