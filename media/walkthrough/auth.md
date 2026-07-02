# Set up shared authorization

Open the **Authorization** panel at the top of the Endpoint Explorer sidebar.

1. Enter the **Base URL** your API runs on (e.g. `http://localhost:5000`).
2. Pick an **Auth Type**:
   - **Bearer Token** — paste a token, done.
   - **Basic Auth** — username + password.
   - **API Key Header** — custom header name + value.
   - **OAuth2 Client Credentials (Advanced)** — enter your token URL, client ID and secret once; the extension fetches the token and auto-refreshes it before every send.
3. Click **Save**.

Whatever you configure here is merged into the headers of **every** request you send — you never re-enter credentials per endpoint.
