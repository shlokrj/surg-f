"""Verify local Databricks authentication without starting compute or printing secrets."""
from pathlib import Path

from databricks.sdk import WorkspaceClient
from dotenv import dotenv_values


def main():
    values = dotenv_values(Path(__file__).resolve().parents[1] / '.env')
    hostname = values.get('DATABRICKS_SERVER_HOSTNAME')
    host = values.get('DATABRICKS_HOST') or (f'https://{hostname}' if hostname else None)
    token = values.get('DATABRICKS_TOKEN')
    if not host or not token:
        raise SystemExit('Set DATABRICKS_SERVER_HOSTNAME (or DATABRICKS_HOST) and DATABRICKS_TOKEN in repo-root .env')
    try:
        client = WorkspaceClient(host=host, token=token, auth_type='pat')
        user = client.current_user.me()
        print('Authenticated account:', user.display_name or user.user_name)
        volume = client.volumes.read('workspace.default.surgf')
        print('Volume metadata accessible:', volume.full_name)
        clusters = list(client.clusters.list())
        print('Visible clusters:', len(clusters))
        print('No compute started; Volume file writes have not been tested.')
    except Exception as exc:
        # SDK exception details can include configuration; keep this output secret-free.
        raise SystemExit(f'Authentication/access check failed: {type(exc).__name__}') from None


if __name__ == '__main__':
    main()
