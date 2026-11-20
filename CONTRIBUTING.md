# Contributing to Admin Portal

Contributions that improve usability, security, framework compatibility, or documentation are welcome.

## Development Checklist
1. Fork the repository and create a feature branch (`git checkout -b feat/my-improvement`).
2. Keep dependencies minimal (zero bloated frameworks).
3. Run syntax verification before committing:
   ```bash
   npm run check:syntax
   ```
4. Never commit test `auth.json`, `admin-config.json`, or personal credentials.
5. Submit a clear Pull Request explaining the problem solved and how you tested it.
