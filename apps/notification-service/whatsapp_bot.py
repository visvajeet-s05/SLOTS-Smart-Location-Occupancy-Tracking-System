"""
Meta WhatsApp Business API Interface for Parking Automation

Handles:
  - Interactive QR Entry Passes (template-based messages)
  - Booking confirmation & slot assignment
  - UPI Payment Link generation & push
  - Violation notices for unpaid free-flow exits
  - Webhook event processing (inbound messages)
  - Receipt delivery after successful payment

This module simulates the Meta Graph API for development/testing.
In production, this would use the actual WhatsApp Business API
via `requests.post` to `https://graph.facebook.com/v18.0/`.
"""

import time
import uuid
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# ──────────────────────────────────────────────────────────────────────────────
#   CONSTANTS
# ──────────────────────────────────────────────────────────────────────────────

# Message types
MSG_TYPE_TEXT = "text"
MSG_TYPE_TEMPLATE = "template"
MSG_TYPE_INTERACTIVE = "interactive"
MSG_TYPE_IMAGE = "image"

# Template names
TEMPLATE_ENTRY_PASS = "slots_entry_pass"
TEMPLATE_BOOKING_CONFIRM = "slots_booking_confirm"
TEMPLATE_VIOLATION_NOTICE = "slots_violation_notice"
TEMPLATE_PAYMENT_RECEIPT = "slots_payment_receipt"

# Message log
_MESSAGE_LOG: List[Dict[str, Any]] = []


class WhatsAppParkingBot:
    """
    Interface for Meta WhatsApp Business API webhook automation.

    Handles booking requests, sends digital QR entry passes, pushes
    violation alerts, and delivers payment receipts.

    Args:
        api_token: WhatsApp Business API token (mock for development).
        phone_number_id: WhatsApp Business phone number ID.
        business_name: Display name for the business account.
    """

    def __init__(
        self,
        api_token: str = "MOCK_WA_TOKEN_SLOTS_2026",
        phone_number_id: str = "10982309812",
        business_name: str = "SLOTS Smart Parking",
    ):
        self.api_token = api_token
        self.phone_number_id = phone_number_id
        self.business_name = business_name
        self.base_url = "https://graph.facebook.com/v18.0"
        logging.info(
            f"WhatsAppParkingBot initialized "
            f"(phone={phone_number_id}, business='{business_name}')"
        )

    # ──────────────────────────────────────────────────────────────────────────
    #   INTERACTIVE QR ENTRY PASS
    # ──────────────────────────────────────────────────────────────────────────

    def send_interactive_qr_pass(
        self,
        phone_number: str,
        vehicle_number: str,
        slot_id: str,
        lot_name: str,
        qr_code_url: str = "https://slots.ai/qr/mock_pass",
        valid_until: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Send a digital QR entry pass via WhatsApp template message.

        The pass includes:
          - Vehicle registration number
          - Parking lot name
          - Allocated slot ID
          - QR code image (as media template)
          - Validity timestamp

        Args:
            phone_number: Recipient WhatsApp number (with country code).
            vehicle_number: Vehicle registration number.
            slot_id: Allocated slot identifier.
            lot_name: Human-readable parking lot name.
            qr_code_url: URL to the QR code image.
            valid_until: Unix timestamp of pass validity expiry.

        Returns:
            Dict with status and message ID.
        """
        message_id = f"wamid.mock.{uuid.uuid4().hex[:12].upper()}"
        timestamp = int(time.time())

        if valid_until is None:
            valid_until = timestamp + 900  # 15 minutes default

        valid_until_iso = datetime.fromtimestamp(
            valid_until, tz=timezone.utc
        ).isoformat()

        payload = {
            "messaging_product": "whatsapp",
            "to": phone_number,
            "type": "template",
            "template": {
                "name": TEMPLATE_ENTRY_PASS,
                "language": {"code": "en"},
                "components": [
                    {
                        "type": "header",
                        "parameters": [
                            {
                                "type": "image",
                                "image": {"link": qr_code_url},
                            }
                        ],
                    },
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": vehicle_number},
                            {"type": "text", "text": lot_name},
                            {"type": "text", "text": slot_id},
                            {"type": "text", "text": valid_until_iso},
                        ],
                    },
                ],
            },
        }

        result = {
            "status": "SENT",
            "messageId": message_id,
            "recipient": phone_number,
            "messageType": "QR_PASS",
            "timestamp": timestamp,
            "payload": payload,
        }

        _MESSAGE_LOG.append(result)
        logging.info(
            f"WhatsApp QR Pass sent to {phone_number} "
            f"for {vehicle_number} @ {lot_name} slot={slot_id} "
            f"(msg={message_id})"
        )

        return dict(result)

    # ──────────────────────────────────────────────────────────────────────────
    #   BOOKING CONFIRMATION
    # ──────────────────────────────────────────────────────────────────────────

    def send_booking_confirmation(
        self,
        phone_number: str,
        vehicle_number: str,
        lot_name: str,
        slot_id: str,
        booking_time: str,
        amount_inr: float,
    ) -> Dict[str, Any]:
        """
        Send a booking confirmation message with slot details.

        Args:
            phone_number: Recipient WhatsApp number.
            vehicle_number: Vehicle registration number.
            lot_name: Parking lot name.
            slot_id: Allocated slot ID.
            booking_time: Booking time as ISO string.
            amount_inr: Amount charged (reservation fee).

        Returns:
            Dict with status and message ID.
        """
        message_id = f"wamid.mock.{uuid.uuid4().hex[:12].upper()}"
        timestamp = int(time.time())

        payload = {
            "messaging_product": "whatsapp",
            "to": phone_number,
            "type": "template",
            "template": {
                "name": TEMPLATE_BOOKING_CONFIRM,
                "language": {"code": "en"},
                "components": [
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": vehicle_number},
                            {"type": "text", "text": lot_name},
                            {"type": "text", "text": slot_id},
                            {"type": "text", "text": booking_time},
                            {"type": "text", "text": f"₹{amount_inr:.2f}"},
                        ],
                    }
                ],
            },
        }

        result = {
            "status": "SENT",
            "messageId": message_id,
            "recipient": phone_number,
            "messageType": "BOOKING_CONFIRM",
            "timestamp": timestamp,
            "payload": payload,
        }

        _MESSAGE_LOG.append(result)
        logging.info(
            f"WhatsApp Booking Confirm sent to {phone_number} "
            f"for {vehicle_number} @ {lot_name} (₹{amount_inr:.2f})"
        )

        return dict(result)

    # ──────────────────────────────────────────────────────────────────────────
    #   VIOLATION NOTICE
    # ──────────────────────────────────────────────────────────────────────────

    def send_violation_notice(
        self,
        phone_number: str,
        vehicle_number: str,
        amount_owed: float,
        payment_link: str,
        penalty_fee: float = 100.0,
        lot_name: str = "Unknown Lot",
        violation_id: str = "",
    ) -> Dict[str, Any]:
        """
        Push an unpaid exit violation notice with direct UPI payment link.

        Args:
            phone_number: Recipient WhatsApp number.
            vehicle_number: Vehicle registration number.
            amount_owed: Base parking fee owed.
            payment_link: UPI/ payment link for immediate settlement.
            penalty_fee: Additional penalty fee (default ₹100).
            lot_name: Parking lot where violation occurred.
            violation_id: Violation reference ID.

        Returns:
            Dict with delivery status and message details.
        """
        message_id = f"wamid.mock.{uuid.uuid4().hex[:12].upper()}"
        total_owed = round(amount_owed + penalty_fee, 2)
        timestamp = int(time.time())

        # Build the message text (for text-based templates)
        message_text = (
            f"⚠️ *SLOTS Free-Flow Unpaid Notice*\n\n"
            f"Dear Customer,\n\n"
            f"Your vehicle *{vehicle_number}* exited "
            f"*{lot_name}* without payment settlement.\n\n"
            f"📋 *Details:*\n"
            f"• Base Fee: ₹{amount_owed:.2f}\n"
            f"• Penalty: ₹{penalty_fee:.2f}\n"
            f"• Total Due: ₹{total_owed:.2f}\n"
            f"• Violation ID: {violation_id}\n\n"
            f"💳 *Pay immediately via UPI:*\n"
            f"{payment_link}\n\n"
            f"Pay within 24 hours to avoid additional penalties."
        )

        payload = {
            "messaging_product": "whatsapp",
            "to": phone_number,
            "type": "text",
            "text": {"preview_url": True, "body": message_text},
        }

        result = {
            "status": "DELIVERED",
            "messageId": message_id,
            "recipient": phone_number,
            "messageType": "VIOLATION_NOTICE",
            "timestamp": timestamp,
            "text": message_text,
            "payload": payload,
        }

        _MESSAGE_LOG.append(result)
        logging.info(
            f"WhatsApp Violation Notice sent to {phone_number} "
            f"for {vehicle_number} — due=₹{total_owed:.2f} "
            f"(msg={message_id})"
        )

        return dict(result)

    # ──────────────────────────────────────────────────────────────────────────
    #   PAYMENT RECEIPT
    # ──────────────────────────────────────────────────────────────────────────

    def send_payment_receipt(
        self,
        phone_number: str,
        vehicle_number: str,
        amount_paid: float,
        transaction_id: str,
        lot_name: str,
        payment_method: str = "UPI",
    ) -> Dict[str, Any]:
        """
        Send a payment receipt after successful settlement.

        Args:
            phone_number: Recipient WhatsApp number.
            vehicle_number: Vehicle registration number.
            amount_paid: Amount paid.
            transaction_id: Payment transaction ID.
            lot_name: Parking lot name.
            payment_method: Payment method used (UPI, FASTag, Card).

        Returns:
            Dict with status and message ID.
        """
        message_id = f"wamid.mock.{uuid.uuid4().hex[:12].upper()}"
        timestamp = int(time.time())
        receipt_time = datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()

        message_text = (
            f"✅ *Payment Receipt — SLOTS Smart Parking*\n\n"
            f"📍 *Lot:* {lot_name}\n"
            f"🚗 *Vehicle:* {vehicle_number}\n"
            f"💰 *Amount Paid:* ₹{amount_paid:.2f}\n"
            f"💳 *Method:* {payment_method}\n"
            f"🔖 *Txn ID:* {transaction_id}\n"
            f"🕐 *Time:* {receipt_time}\n\n"
            f"Thank you for using SLOTS! 🙏"
        )

        payload = {
            "messaging_product": "whatsapp",
            "to": phone_number,
            "type": "text",
            "text": {"body": message_text},
        }

        result = {
            "status": "SENT",
            "messageId": message_id,
            "recipient": phone_number,
            "messageType": "PAYMENT_RECEIPT",
            "timestamp": timestamp,
            "text": message_text,
            "payload": payload,
        }

        _MESSAGE_LOG.append(result)
        logging.info(
            f"WhatsApp Receipt sent to {phone_number} "
            f"for {vehicle_number} — ₹{amount_paid:.2f} via {payment_method}"
        )

        return dict(result)

    # ──────────────────────────────────────────────────────────────────────────
    #   CUSTOM TEXT MESSAGE (generic)
    # ──────────────────────────────────────────────────────────────────────────

    def send_text_message(
        self,
        phone_number: str,
        text: str,
        preview_url: bool = False,
    ) -> Dict[str, Any]:
        """
        Send a plain text message via WhatsApp.

        Args:
            phone_number: Recipient WhatsApp number.
            text: Message text content.
            preview_url: Whether to enable URL previews.

        Returns:
            Dict with status and message ID.
        """
        message_id = f"wamid.mock.{uuid.uuid4().hex[:12].upper()}"
        timestamp = int(time.time())

        payload = {
            "messaging_product": "whatsapp",
            "to": phone_number,
            "type": "text",
            "text": {"preview_url": preview_url, "body": text},
        }

        result = {
            "status": "SENT",
            "messageId": message_id,
            "recipient": phone_number,
            "messageType": "TEXT",
            "timestamp": timestamp,
            "text": text,
            "payload": payload,
        }

        _MESSAGE_LOG.append(result)
        logging.info(f"WhatsApp Text sent to {phone_number} (msg={message_id})")

        return dict(result)

    # ──────────────────────────────────────────────────────────────────────────
    #   WEBHOOK EVENT PROCESSING (inbound)
    # ──────────────────────────────────────────────────────────────────────────

    def process_webhook_event(
        self,
        webhook_payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Process an inbound WhatsApp webhook event from Meta.

        Handles:
          - Text messages (booking requests, help queries)
          - Interactive button replies (confirm, cancel, pay)
          - Delivery receipts / read receipts

        Args:
            webhook_payload: Raw webhook payload from Meta Graph API.

        Returns:
            Processed event dict with parsed intent.
        """
        event_id = f"wh_{uuid.uuid4().hex[:8].upper()}"
        timestamp = int(time.time())

        # Extract basic info from webhook
        entries = webhook_payload.get("entry", [])
        if not entries:
            return {
                "eventId": event_id,
                "status": "IGNORED",
                "reason": "No entries in webhook payload",
            }

        changes = entries[0].get("changes", [])
        if not changes:
            return {
                "eventId": event_id,
                "status": "IGNORED",
                "reason": "No changes in webhook entry",
            }

        value = changes[0].get("value", {})
        messages = value.get("messages", [])

        if not messages:
            return {
                "eventId": event_id,
                "status": "IGNORED",
                "reason": "No messages in webhook value",
            }

        # Process first message
        msg = messages[0]
        msg_from = msg.get("from", "unknown")
        msg_type = msg.get("type", "unknown")
        msg_id = msg.get("id", "unknown")

        # Parse intent based on message content
        intent = "UNKNOWN"
        response_text = ""

        if msg_type == "text":
            text_body = msg.get("text", {}).get("body", "").lower()

            if any(kw in text_body for kw in ["pay", "payment", "upi"]):
                intent = "PAYMENT_REQUEST"
                response_text = (
                    "💳 *Payment Link*\n\n"
                    "Click here to pay your pending dues:\n"
                    "https://upi.slots.ai/pay/request"
                )
            elif any(kw in text_body for kw in ["book", "reserve"]):
                intent = "BOOKING_REQUEST"
                response_text = (
                    "🎯 *Booking Request Received!*\n\n"
                    "Please reply with:\n"
                    "1. Your vehicle number\n"
                    "2. Preferred lot\n"
                    "3. Duration (hours)\n\n"
                    "We'll send your QR pass shortly!"
                )
            elif any(kw in text_body for kw in ["park"]):
                # "park" is less specific - check after pay/book
                intent = "BOOKING_REQUEST"
                response_text = (
                    "🎯 *Parking Request Received!*\n\n"
                    "Please reply with:\n"
                    "1. Your vehicle number\n"
                    "2. Preferred lot\n"
                    "3. Duration (hours)\n\n"
                    "We'll send your QR pass shortly!"
                )
            elif any(kw in text_body for kw in ["help", "support"]):
                intent = "HELP"
                response_text = (
                    "🆘 *SLOTS Help*\n\n"
                    "Available commands:\n"
                    "• *Book* — Reserve a parking slot\n"
                    "• *Pay* — Pay pending dues\n"
                    "• *Status* — Check vehicle status\n"
                    "• *Help* — Show this menu"
                )
            elif any(kw in text_body for kw in ["status", "where"]):
                intent = "STATUS_CHECK"
                response_text = (
                    "📍 *Vehicle Status*\n\n"
                    "Please reply with your vehicle number "
                    "to check current parking status."
                )
            else:
                intent = "GENERAL_QUERY"
                response_text = (
                    "👋 Welcome to *SLOTS Smart Parking*!\n\n"
                    "Reply with *Book* to reserve a slot, "
                    "*Pay* for payments, or *Help* for assistance."
                )

        elif msg_type == "interactive":
            # Handle button replies
            button_reply = (
                msg.get("interactive", {})
                .get("button_reply", {})
                .get("id", "")
            )
            if button_reply == "CONFIRM_BOOKING":
                intent = "BOOKING_CONFIRMED"
                response_text = "✅ Booking confirmed! Your QR pass is on the way."
            elif button_reply == "CANCEL_BOOKING":
                intent = "BOOKING_CANCELLED"
                response_text = "❌ Booking cancelled. No charges applied."
            elif button_reply == "PAY_NOW":
                intent = "PAYMENT_INITIATED"
                response_text = (
                    "🔗 *Payment Link Generated*\n\n"
                    "https://upi.slots.ai/pay/instant"
                )
            else:
                intent = "INTERACTIVE_REPLY"
                response_text = f"Received button reply: {button_reply}"

        logging.info(
            f"WhatsApp Webhook: from={msg_from}, type={msg_type}, "
            f"intent={intent} (msg_id={msg_id})"
        )

        return {
            "eventId": event_id,
            "status": "PROCESSED",
            "from": msg_from,
            "messageId": msg_id,
            "messageType": msg_type,
            "intent": intent,
            "autoReply": response_text,
            "timestamp": timestamp,
        }

    # ──────────────────────────────────────────────────────────────────────────
    #   UTILITY: Generate UPI Payment Link
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def generate_upi_payment_link(
        amount_inr: float,
        reference_id: str,
        payee_name: str = "SLOTS Parking",
        payee_vpa: str = "slots@upi",
    ) -> str:
        """
        Generate a UPI deep link for payment.

        Format: upi://pay?pa=...&pn=...&am=...&tr=...&tn=...

        Args:
            amount_inr: Amount to pay.
            reference_id: Transaction reference ID.
            payee_name: Payee display name.
            payee_vpa: Payee UPI VPA address.

        Returns:
            UPI deep link string.
        """
        import urllib.parse

        params = {
            "pa": payee_vpa,
            "pn": payee_name,
            "am": f"{amount_inr:.2f}",
            "tr": reference_id,
            "tn": f"SLOTS Parking Payment — {reference_id}",
            "cu": "INR",
        }
        encoded = urllib.parse.urlencode(params)
        return f"upi://pay?{encoded}"

    # ──────────────────────────────────────────────────────────────────────────
    #   MESSAGE LOG
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    def get_message_log(limit: int = 50) -> List[Dict[str, Any]]:
        """Get the message log for audit/reconciliation."""
        return list(_MESSAGE_LOG[-limit:])

    @staticmethod
    def clear_message_log():
        """Clear the message log (for test isolation)."""
        _MESSAGE_LOG.clear()