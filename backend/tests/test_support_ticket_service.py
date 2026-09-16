import unittest
from unittest.mock import patch

from fastapi import HTTPException

from backend import support_ticket_service


def ticket(ticket_id, user_id, created_at, status="open"):
    return {
        "id": ticket_id,
        "ticket_number": f"BST-{ticket_id}",
        "subject": f"Ticket {ticket_id}",
        "status": status,
        "priority": "normal",
        "created_at": created_at,
        "updated_at": created_at,
        "last_message_at": created_at,
        "data": {
            "userId": user_id,
            "userType": "student",
            "reason": f"Reason {ticket_id}",
        },
    }


class SupportTicketServiceTests(unittest.TestCase):
    @patch("backend.support_ticket_service._rest")
    def test_root_queue_is_fifo_for_active_tickets(self, rest):
        rows = [
            ticket("oldest", "student-1", "2026-01-01T00:00:00Z"),
            ticket("second", "student-2", "2026-01-02T00:00:00Z", "in_progress"),
            ticket("resolved", "student-3", "2026-01-03T00:00:00Z", "resolved"),
        ]
        rest.side_effect = lambda table, **kwargs: rows if table == "support_feedback" else []

        result = support_ticket_service.list_root_tickets()

        self.assertEqual(["oldest", "second", "resolved"], [item["id"] for item in result])
        self.assertEqual([1, 2], [item["queuePosition"] for item in result[:2]])

    @patch("backend.support_ticket_service._rest")
    def test_portal_list_only_returns_owned_tickets(self, rest):
        rows = [
            ticket("mine", "student-1", "2026-01-01T00:00:00Z"),
            ticket("other", "student-2", "2026-01-02T00:00:00Z"),
        ]
        rest.side_effect = lambda table, **kwargs: rows if table == "support_feedback" else []

        result = support_ticket_service.list_portal_tickets("student-1", "student")

        self.assertEqual(["mine"], [item["id"] for item in result])

    @patch("backend.support_ticket_service._ticket_row")
    def test_portal_cannot_open_another_users_ticket(self, ticket_row):
        ticket_row.return_value = ticket("private", "student-2", "2026-01-01T00:00:00Z")

        with self.assertRaises(HTTPException) as raised:
            support_ticket_service.get_portal_ticket("private", "student-1", "student")

        self.assertEqual(403, raised.exception.status_code)

    @patch("backend.support_ticket_service._normalize_ticket", return_value={"id": "ticket-1", "messages": []})
    @patch("backend.support_ticket_service._ticket_row")
    @patch("backend.support_ticket_service._rest")
    def test_root_reply_is_written_to_the_conversation(self, rest, ticket_row, _normalize):
        ticket_row.return_value = ticket("ticket-1", "student-1", "2026-01-01T00:00:00Z")

        support_ticket_service.update_root_ticket(
            {"ticketId": "ticket-1", "status": "in_progress", "priority": "high", "reply": "We are checking this."},
            "Tristan@Root",
        )

        message_calls = [call for call in rest.call_args_list if call.args[0] == "support_ticket_messages"]
        self.assertEqual(1, len(message_calls))
        self.assertEqual("root", message_calls[0].kwargs["payload"]["sender_type"])
        self.assertEqual("We are checking this.", message_calls[0].kwargs["payload"]["body"])


if __name__ == "__main__":
    unittest.main()
