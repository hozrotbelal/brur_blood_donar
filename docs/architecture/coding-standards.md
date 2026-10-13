# Coding standards

Proposed; adjust through a pull request approved by a human.

- Backend: TypeScript in strict mode on Node.js LTS with NestJS. Mobile: Dart with Flutter.
- Each module folder exposes one public interface; everything else is private to the module.
- No business logic in the mobile app or in shared packages.
- Small pull requests, one module and one layer at a time.
- Tests accompany every change to business logic.
- Keep comments minimal: no block comments above functions, classes or methods, and no narration of changes.
- No new dependency without a written reason, publisher check and human approval; install with scripts disabled.
- All user-visible text goes through the localisation files (Bangla and English).
