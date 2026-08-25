"""Certification expiry alerts.

Every inspection has a validity date. This service watches those dates and mails
both sides before one lapses, at the thresholds configured in ALERT_THRESHOLDS
(60 / 30 / 7 days by default), then escalates once the date has passed.

An ExpiryAlert row is written per (equipment, threshold, expiry date), so a
reminder is never sent twice - and if a new inspection moves the expiry date, a
fresh set of reminders is raised against the new date.
"""
import logging
from datetime import date

from flask import current_app

from extensions import db
from models import Equipment, ExpiryAlert, Report, ReportStatus, Role, User
from models.base import utcnow
from services.mailer import send_mail

log = logging.getLogger(__name__)

# Sentinel threshold for the post-expiry escalation.
EXPIRED = 0


def due_thresholds(days_remaining, thresholds):
    """Which configured thresholds this equipment has now crossed."""
    if days_remaining < 0:
        return [EXPIRED]
    return [t for t in thresholds if days_remaining <= t]


def recipients_for(equipment):
    """Client contacts flagged for alerts, plus the team lead and admin copies."""
    to, cc = [], []

    for contact in equipment.client.contacts if equipment.client else []:
        if contact.receives_alerts and contact.email:
            to.append(contact.email)

    # Team lead from the most recent report against this equipment.
    latest = (
        Report.query.filter(Report.equipment_id == equipment.id)
        .order_by(Report.inspection_date.desc().nullslast(), Report.id.desc())
        .first()
    )
    if latest and latest.job and latest.job.team_lead and latest.job.team_lead.email:
        cc.append(latest.job.team_lead.email)

    # Office copy for overall tracking.
    for admin in User.query.filter(User.role == Role.ADMIN, User.is_active.is_(True)).all():
        if admin.email:
            cc.append(admin.email)

    return sorted(set(to)), sorted(set(cc) - set(to))


def build_email(equipment, days_remaining, report):
    expiry = equipment.certificate_expiry_date
    expired = days_remaining < 0

    if expired:
        subject = f"EXPIRED: certification for {equipment.tag_number} lapsed on {expiry:%d %b %Y}"
        urgency = f"expired {abs(days_remaining)} day(s) ago"
    else:
        subject = f"Certification expiring in {days_remaining} day(s): {equipment.tag_number}"
        urgency = f"{days_remaining} day(s) remaining"

    link = f"{current_app.config['FRONTEND_URL']}/equipment/{equipment.id}"

    html = f"""
    <div style="font-family:Roboto,Arial,sans-serif;color:#252525;max-width:600px">
      <div style="border-left:5px solid #ff6600;padding:0 0 0 16px">
        <h2 style="color:#3c515b;margin:0 0 4px">Certification {'Expired' if expired else 'Expiry Notice'}</h2>
        <p style="color:#738289;margin:0">{equipment.client.name if equipment.client else ''}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <tr><td style="padding:8px 0;color:#738289">Equipment</td>
            <td style="padding:8px 0;font-weight:600">{equipment.tag_number}
                &mdash; {equipment.equipment_type.name if equipment.equipment_type else ''}</td></tr>
        <tr><td style="padding:8px 0;color:#738289">Location</td>
            <td style="padding:8px 0">{equipment.location or '-'}</td></tr>
        <tr><td style="padding:8px 0;color:#738289">Last report</td>
            <td style="padding:8px 0">{report.report_number if report else '-'}</td></tr>
        <tr><td style="padding:8px 0;color:#738289">Expiry date</td>
            <td style="padding:8px 0;font-weight:600">{expiry:%d %B %Y}</td></tr>
        <tr><td style="padding:8px 0;color:#738289">Status</td>
            <td style="padding:8px 0;color:#ff6600;font-weight:700">{urgency}</td></tr>
      </table>
      <p>Please arrange the re-inspection so the certification does not lapse.</p>
      <p><a href="{link}" style="display:inline-block;background:#ff6600;color:#fff;
            text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">
            Open in the portal</a></p>
      <p style="color:#738289;font-size:12px;margin-top:28px">
        Sent automatically by the SGS Lifting Equipment Reporting Platform.</p>
    </div>
    """
    return subject, html


def scan_and_send(today=None, dry_run=False):
    """Run one alert pass. Returns a summary dict."""
    today = today or date.today()
    thresholds = current_app.config["ALERT_THRESHOLDS"]

    equipment_list = (
        Equipment.query.filter(
            Equipment.is_active.is_(True),
            Equipment.certificate_expiry_date.isnot(None),
        ).all()
    )

    summary = {"scanned": len(equipment_list), "raised": 0, "sent": 0, "failed": 0, "skipped": 0}

    for equipment in equipment_list:
        days_remaining = (equipment.certificate_expiry_date - today).days
        crossed = due_thresholds(days_remaining, thresholds)
        if not crossed:
            summary["skipped"] += 1
            continue

        # Only the tightest threshold crossed matters - the wider ones already fired.
        threshold = min(crossed)

        already = ExpiryAlert.query.filter_by(
            equipment_id=equipment.id,
            threshold_days=threshold,
            expiry_date=equipment.certificate_expiry_date,
        ).first()
        if already:
            summary["skipped"] += 1
            continue

        latest_report = (
            Report.query.filter(
                Report.equipment_id == equipment.id,
                Report.status.in_([ReportStatus.APPROVED, ReportStatus.CLIENT_APPROVED]),
            )
            .order_by(Report.inspection_date.desc().nullslast(), Report.id.desc())
            .first()
        )

        to, cc = recipients_for(equipment)
        subject, html = build_email(equipment, days_remaining, latest_report)

        alert = ExpiryAlert(
            equipment_id=equipment.id,
            report_id=latest_report.id if latest_report else None,
            threshold_days=threshold,
            expiry_date=equipment.certificate_expiry_date,
            recipients=to + cc,
            subject=subject,
        )
        db.session.add(alert)
        summary["raised"] += 1

        if dry_run:
            alert.delivery_status = "pending"
            continue

        sent, error = send_mail(to, subject, html, cc=cc)
        if sent:
            alert.delivery_status = "sent"
            alert.sent_at = utcnow()
            summary["sent"] += 1
        else:
            alert.delivery_status = "failed"
            alert.error = error
            summary["failed"] += 1

    db.session.commit()
    log.info("Expiry scan complete: %s", summary)
    return summary


def start_scheduler(app):
    """Run the scan once a day at 07:00 server time."""
    if not app.config.get("SCHEDULER_ENABLED"):
        return None

    from apscheduler.schedulers.background import BackgroundScheduler

    scheduler = BackgroundScheduler(daemon=True)

    def job():
        with app.app_context():
            try:
                scan_and_send()
            except Exception:
                log.exception("Scheduled expiry scan failed")

    scheduler.add_job(job, "cron", hour=7, minute=0, id="expiry_scan", replace_existing=True)
    scheduler.start()
    app.extensions["expiry_scheduler"] = scheduler
    log.info("Expiry alert scheduler started (daily at 07:00)")
    return scheduler
