"""Client for the Databricks Genie Conversation API.

Genie turns a natural-language question into SQL over the tables in one Genie space, runs
it, and returns text and/or a result table. Genie writes and runs the SQL itself; this
service never executes SQL that Genie wrote.
"""

import time
from dataclasses import dataclass, field

import httpx

from .config import DatabricksCredentials

TERMINAL_FAILURES = {"FAILED", "CANCELLED", "QUERY_RESULT_EXPIRED"}
MAX_ROWS = 500
INT_TYPES = {"BYTE", "SHORT", "INT", "LONG", "BIGINT"}
FLOAT_TYPES = {"FLOAT", "DOUBLE", "DECIMAL"}


class GenieError(Exception):
    """Genie could not answer (HTTP error, failure status, or timeout)."""


@dataclass
class GenieAnswer:
    conversation_id: str
    text: str | None = None  # Genie's prose reply, if any
    sql: str | None = None  # the query Genie wrote, if any
    description: str | None = None  # Genie's summary of that query
    columns: list[str] = field(default_factory=list)
    rows: list[list] = field(default_factory=list)


def _cast(value, type_name: str):
    """The result API returns every value as a string; restore numbers and booleans."""
    if value is None:
        return None
    try:
        if type_name in INT_TYPES:
            return int(value)
        if type_name in FLOAT_TYPES:
            return float(value)
    except (TypeError, ValueError):
        return value
    if type_name == "BOOLEAN":
        return str(value).lower() == "true"
    return value


class GenieClient:
    def __init__(
        self,
        credentials: DatabricksCredentials,
        space_id: str,
        timeout_sec: float = 40.0,
        poll_sec: float = 1.0,
        transport: httpx.BaseTransport | None = None,
    ):
        self._space = f"/api/2.0/genie/spaces/{space_id}"
        self._timeout_sec = timeout_sec
        self._poll_sec = poll_sec
        self._http = httpx.Client(
            base_url=f"https://{credentials.server_hostname}",
            headers={"Authorization": f"Bearer {credentials.access_token}"},
            timeout=20.0,
            transport=transport,
        )

    def _call(self, method: str, path: str, **kwargs) -> dict:
        try:
            response = self._http.request(method, path, **kwargs)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            raise GenieError(f"HTTP {exc.response.status_code}") from exc
        except (httpx.HTTPError, ValueError) as exc:
            raise GenieError(type(exc).__name__) from exc

    def ask(self, question: str) -> GenieAnswer:
        """Start a new conversation, wait for Genie to finish, and collect its answer."""
        started = self._call(
            "POST", f"{self._space}/start-conversation", json={"content": question}
        )
        conversation_id, message_id = started["conversation_id"], started["message_id"]
        message_path = f"{self._space}/conversations/{conversation_id}/messages/{message_id}"

        deadline = time.monotonic() + self._timeout_sec
        while True:
            message = self._call("GET", message_path)
            status = message.get("status")
            if status == "COMPLETED":
                break
            if status in TERMINAL_FAILURES:
                raise GenieError(f"status {status}")
            if time.monotonic() >= deadline:
                raise GenieError("timeout")
            time.sleep(self._poll_sec)

        answer = GenieAnswer(conversation_id=conversation_id)
        texts = []
        for attachment in message.get("attachments") or []:
            if attachment.get("text", {}).get("content"):
                texts.append(attachment["text"]["content"])
            query = attachment.get("query")
            if query and query.get("query") and answer.sql is None:
                answer.sql = query["query"]
                answer.description = query.get("description")
                attachment_id = attachment.get("attachment_id") or attachment.get("id")
                result = self._call(
                    "GET", f"{message_path}/attachments/{attachment_id}/query-result"
                )
                statement = result.get("statement_response") or {}
                columns = statement.get("manifest", {}).get("schema", {}).get("columns") or []
                answer.columns = [c["name"] for c in columns]
                types = [c.get("type_name", "STRING") for c in columns]
                data = statement.get("result", {}).get("data_array") or []
                answer.rows = [
                    [_cast(value, type_name) for value, type_name in zip(row, types, strict=False)]
                    for row in data[:MAX_ROWS]
                ]
        # Genie often adds a suggested follow-up question as a text attachment. Prefer a
        # statement; keep a question only when there is no result table to show instead.
        statements = [t for t in texts if not t.strip().endswith("?")]
        if statements:
            answer.text = statements[0]
        elif texts and not answer.rows:
            answer.text = texts[0]
        return answer
