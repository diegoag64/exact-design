# Security policy

## Report a vulnerability

Don't report security problems in public issues. Report them privately with [GitHub private vulnerability reporting](https://github.com/diegoag64/exact-design/security/advisories/new).

Include the affected version or commit, steps to reproduce, and the impact you observed. You'll get an acknowledgement when the maintainer has read the report. This is a spare-time project, so there is no guaranteed response time.

## Supported versions

Only the latest commit on `main` receives fixes.

## Scope

Exact Design is a local development tool. The editor, its preview helper, and connected apps are meant to listen on `127.0.0.1` only. **Apply** writes changes to source files in a connected project.

These reports are in scope:

- A web page or another origin that can read data from the editor or helper, or trigger a source write.
- A source write outside the connected project, or a write that skips the digest checks or compiler validation.
- Exposure of the local Exact tool token to another origin.

Problems that require an attacker who already controls your machine or your app's source are out of scope.
