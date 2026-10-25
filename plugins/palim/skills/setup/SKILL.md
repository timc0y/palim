---
name: setup
description: Set up the already installed Palim plugin. Use its bundled connection and the user's browser sign-in; never ask for a separate skill installation.
---

# Set up Palim

Palim's workflow and connection are already included in this plugin. Do not install another skill, add a duplicate MCP server or request an API key.

1. Check whether the bundled Palim tools are available. If the client asks to connect, use its own OAuth sign-in flow. Let the user enter their inbox code in the browser and review consent. Never request codes, access tokens, cookies, Amazon passwords or new application credentials in chat. Respect an account or workspace policy that blocks the connection.
2. Once connected, explain that the agent can create a reading edition immediately. A draft and download require no Kindle setup and never send email. Offer a useful small draft only when the user requests one; do not create or send a test automatically.
3. Kindle delivery is optional. Open the deployment's workspace from the connection's HTTPS origin, at `/app`. The user saves and confirms their destination there and approves the exact sender in Amazon's personal-document settings. Requesting a verification book sends real mail: establish its exact recipient and purpose and obtain the user's delivery request first. The user must read its code at their destination, not from logs or storage.
4. For an existing EPUB/PDF, preserve its original bytes. If this client's file hand-off is unsupported, use the authenticated workspace upload rather than inventing a URL or encoding the file into chat.

Say which step actually completed. A visible plugin or valid manifest is not a completed OAuth connection, and a provider receipt is not Kindle import or device delivery.
