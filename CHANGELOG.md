# Changelog

## 1.0.0 (2026-02-10)


### Features

* **002:** implement agent kill, heartbeat, tools, and integration tests (WP06-WP09) ([ea11101](https://github.com/rothnic/opencode-teams/commit/ea11101502331b1ea8d1d63aecc04875ca7b2f6b))
* **003:** add CLI session manager with launch/attach/detach/status/dashboard commands ([8936efc](https://github.com/rothnic/opencode-teams/commit/8936efcde77fa91ad259cf6944a5b18508e00fbe))
* **004:** implement WP01 schema extensions ([7ebede7](https://github.com/rothnic/opencode-teams/commit/7ebede7d5c14781809d6f33b6d54e8ed1f900a06))
* **004:** implement WP04-WP06 team extensions, workflow monitor, and tool integration ([d5533f2](https://github.com/rothnic/opencode-teams/commit/d5533f2b428e5296505640c3982bc27dbfcfcf49))
* add 6 feature specifications with quality checklists ([9acbdb5](https://github.com/rothnic/opencode-teams/commit/9acbdb5a2d917ac5e75df368793a5026a5a98240))
* add dispatch engine with condition evaluation and action execution (WP03) ([d619415](https://github.com/rothnic/opencode-teams/commit/d619415d37b8f45f853e90e1e8b5c87d7fbae2b1))
* add dispatch event schemas and EventBus infrastructure (WP01) ([eed3aa8](https://github.com/rothnic/opencode-teams/commit/eed3aa834b09e76992ee22abc08ea4c6d936dfe0))
* add dispatch rule tools and E2E integration tests (WP04) ([2a46d1c](https://github.com/rothnic/opencode-teams/commit/2a46d1c1d33392f9c43d6519397b0df62c18047a))
* add quality guard system with ls-lint, markdownlint-cli2, and tiered hooks ([817c9ee](https://github.com/rothnic/opencode-teams/commit/817c9ee0f897aa066d61fc68f810b2195614399d))
* implement poll_inbox and fix JSON persistence ([6e0dbce](https://github.com/rothnic/opencode-teams/commit/6e0dbce23afd7ca70221408a8e9226eeed23b6ed))
* implement role permission system (WP03) ([4a9e032](https://github.com/rothnic/opencode-teams/commit/4a9e032c1c8463c4e5e1f37698e1b74c52f74aa1))
* implement task system with dependency tracking (US-003) ([b208fdb](https://github.com/rothnic/opencode-teams/commit/b208fdb7a0efcc6f281046bda69efaf596489533))
* implement WP03 test scenarios and coordination flow tests ([cf3089a](https://github.com/rothnic/opencode-teams/commit/cf3089ad09519cfd25be9e40e13db306d697e68b))
* instrument task/agent operations with event emission (WP02) ([528bfde](https://github.com/rothnic/opencode-teams/commit/528bfdeacf396578cba7d7fad873ac962222e26d))
* move configs to .config/, add root-file allowlist, untrack runtime dirs ([9dbad02](https://github.com/rothnic/opencode-teams/commit/9dbad02824e8cf28aa1cff0c4abc1948e5e29458))
* Phase 1 - Foundation & Data Integrity ([467a52d](https://github.com/rothnic/opencode-teams/commit/467a52dd0e3ba27816dc46ed713ff58e4ca740b4))
* ralph-tui-us001 - US-001: Centralized State Management & Concurrency ([1fa09c8](https://github.com/rothnic/opencode-teams/commit/1fa09c8ed6b0d66416b66bb5bd14f5e6785527bb))
* ralph-tui-us002 - US-002: Inbox Protocol & Long-Polling ([f90634f](https://github.com/rothnic/opencode-teams/commit/f90634f445a43280f5738ef351ba0f4486fc68e5))
* ralph-tui-us003 - US-003: Task System with Dependency Tracking ([d29ac47](https://github.com/rothnic/opencode-teams/commit/d29ac4798ceb2dc78b2dd7ac752fb445717a1eb9))
* ralph-tui-us004 - US-004: Soft Blocking in Task Claiming ([a3c3eb4](https://github.com/rothnic/opencode-teams/commit/a3c3eb4dc8e403cdd9ecc51d31c88556baec5e44))
* ralph-tui-us005 - US-005: Global CLI opencode-teams ([489687f](https://github.com/rothnic/opencode-teams/commit/489687f3b6ad181a68a733f85e6c025be92fdefa))
* ralph-tui-us006 - US-006: Real-time Tiled Visualization Layout ([88b5703](https://github.com/rothnic/opencode-teams/commit/88b57036739ad973b3f5ae616c4427966a7cb62c))
* ralph-tui-us007 - US-007: Installation & Lifecycle Management ([9f50356](https://github.com/rothnic/opencode-teams/commit/9f5035613768a584de762da35fd6ca61484f79c3))
* **testing:** Implement E2E harness core infrastructure (WP01) ([c445d00](https://github.com/rothnic/opencode-teams/commit/c445d00efe10b2a99c40a6b6bdc44783dee5921c))
* **WP01:** add agent lifecycle Zod schemas and type exports ([f327db4](https://github.com/rothnic/opencode-teams/commit/f327db4b142379784d4d0b887c9982b9f0f1c0e5))
* **WP01:** add structured message types with typed shutdown coordination ([363415b](https://github.com/rothnic/opencode-teams/commit/363415b762d7d42d8b1a2f13c539b7aa52ab2c8c))
* **WP01:** add structured message types with typed shutdown coordination ([3ef15cf](https://github.com/rothnic/opencode-teams/commit/3ef15cfc7aa0c9ecc20e7ae26d8504eb6df379cf))
* **WP02:** add bidirectional dependencies with blocks field (FR-009) ([4536a10](https://github.com/rothnic/opencode-teams/commit/4536a1021ff421f1c1b6039c24771eb120c81a58))
* **WP02:** add bidirectional dependencies with blocks field (FR-009) ([2fe28fd](https://github.com/rothnic/opencode-teams/commit/2fe28fd2b1f00595a92238fdbb0897150f56bac9))
* **WP02:** add bidirectional dependencies with blocks field (FR-009) ([4b0f6a8](https://github.com/rothnic/opencode-teams/commit/4b0f6a81bca7f28aadf30551c12a92f5247f409a))
* **WP02:** add storage paths and color pool utilities ([1ce007c](https://github.com/rothnic/opencode-teams/commit/1ce007cea89ecd10f4299aaff5bd9b45ac8e3240))
* **WP03:** add server manager operations for agent lifecycle ([fe94530](https://github.com/rothnic/opencode-teams/commit/fe9453094398af1ec1f8b9be996b96171df666fc))
* **WP03:** enforce forward-only status transitions and cascade unblocking (FR-010, FR-011) ([6bca61e](https://github.com/rothnic/opencode-teams/commit/6bca61e26ce8dcd3da34a83a1adfe6722eb9de4e))
* **WP03:** enforce forward-only status transitions and cascade unblocking (FR-010, FR-011) ([21acb28](https://github.com/rothnic/opencode-teams/commit/21acb2802eb37e41593af81ebdf68be4875d98dc))
* **WP04:** add multi-process concurrency stress tests and P1-P4 e2e scenario tests ([61b8d88](https://github.com/rothnic/opencode-teams/commit/61b8d88165bac1a5e0e0a410385dab88f741f1f2))
* **WP04:** add tmux operations extensions for agent lifecycle ([cac4d98](https://github.com/rothnic/opencode-teams/commit/cac4d982ea9c3e4292c9008b525cd8f4066adb16))
* **WP05:** add agent spawn operations with state management ([b19a41c](https://github.com/rothnic/opencode-teams/commit/b19a41c5b6dc946c1bc6f2497c2809bffdad5519))


### Bug Fixes

* align markdownlint emphasis style with prettier (underscore) ([e12a4a5](https://github.com/rothnic/opencode-teams/commit/e12a4a56dfae67df84305d08d7f1d120c4f64929))
* replace underscore emphasis with asterisks in comparison analysis ([87faefb](https://github.com/rothnic/opencode-teams/commit/87faefb584fc7bd0dda8696112b5560fb17f632d))
* resolve lint errors in test files (__dirname, empty catch) ([92a7eba](https://github.com/rothnic/opencode-teams/commit/92a7eba1e91c8e1faf1ba934e25d43665ea1ebbd))

## Changelog

All notable changes to this project will be documented here by Release Please.
