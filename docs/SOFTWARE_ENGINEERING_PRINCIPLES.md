# Software Engineering Principles for AI Coding Agents

> A practical reference for designing, modifying, reviewing, and refactoring software.
>
> The goal of this document is not to enforce patterns mechanically. Prefer the simplest design that satisfies current requirements while preserving clarity, testability, operability, and the ability to change.

---

## 1. Core Engineering Philosophy

When making implementation decisions, optimize for:

1. **Correctness** — behavior matches requirements and invariants.
2. **Simplicity** — avoid unnecessary abstractions, dependencies, layers, and indirection.
3. **Readability** — code should communicate intent to future maintainers.
4. **Maintainability** — local changes should have local effects.
5. **Testability** — important behavior should be easy to verify automatically.
6. **Observability** — production behavior should be diagnosable.
7. **Security** — use secure defaults and minimize trust.
8. **Reliability** — handle failure intentionally.
9. **Performance** — optimize measured bottlenecks, not imagined ones.
10. **Reversibility** — prefer decisions that are easy to change when uncertainty is high.

### Default decision rules

- Prefer composition over inheritance.
- Prefer explicit code over clever code.
- Prefer boring, proven technology unless novelty solves a real problem.
- Prefer cohesive modules with narrow interfaces.
- Prefer dependency inversion at architectural boundaries.
- Prefer immutable data where practical.
- Make illegal states difficult or impossible to represent.
- Validate inputs at trust boundaries.
- Treat external systems as unreliable.
- Do not introduce a design pattern unless it reduces complexity.
- Do not generalize until there is evidence of repeated variation.
- Preserve existing conventions unless there is a strong reason to improve them.

---

# 2. SOLID Principles

## S — Single Responsibility Principle

A module, class, or function should have one primary reason to change.

### Prefer

- Small cohesive modules.
- Separation between domain logic, persistence, transport, and presentation.
- Functions that perform one conceptual operation.

### Avoid

- "God" classes.
- Services that validate, persist, send email, format output, and log business events.
- Utility modules containing unrelated behavior.

---

## O — Open/Closed Principle

Software entities should be open for extension but closed for unnecessary modification.

Use stable abstractions where genuine variation exists.

### Prefer

- Strategy objects for interchangeable algorithms.
- Plugins/adapters for multiple providers.
- Configuration for expected variation.

### Avoid

- Large `if/else` or `switch` statements that grow every time a new implementation is added.
- Premature abstraction for hypothetical future variants.

---

## L — Liskov Substitution Principle

Implementations of an abstraction should preserve the behavioral expectations of that abstraction.

### Rules

- Do not strengthen preconditions in a subtype.
- Do not weaken postconditions.
- Preserve invariants.
- Avoid implementations that unexpectedly throw "unsupported" for required operations.

If implementations cannot honor the same contract, the abstraction is probably wrong.

---

## I — Interface Segregation Principle

Consumers should depend only on capabilities they need.

### Prefer

```text
Readable
Writable
Deletable
```

over one large interface when callers need only subsets of behavior.

Avoid "fat" interfaces with unrelated methods.

---

## D — Dependency Inversion Principle

High-level policy should not depend directly on low-level infrastructure.

Both should depend on abstractions.

### Typical dependency direction

```text
UI / HTTP / CLI
      |
Application / Use Cases
      |
Domain
      ^
Adapters / Infrastructure
```

The domain should not know about databases, web frameworks, message brokers, or cloud SDKs unless those concepts are inherently part of the domain.

---

# 3. General Design Principles

## DRY — Don't Repeat Yourself

Avoid duplicating **knowledge**, not merely duplicated syntax.

Two similar-looking blocks may represent different concepts and should sometimes remain separate.

Extract shared logic when:

- the same business rule appears in multiple places;
- changes must remain synchronized;
- a clear shared abstraction exists.

Do not create awkward abstractions merely to eliminate a few repeated lines.

---

## KISS — Keep It Simple

Choose the simplest design that solves the actual problem.

Before adding:

- a framework,
- a base class,
- an event bus,
- reflection,
- metaprogramming,
- a plugin system,
- distributed infrastructure,

ask whether a simpler direct solution is sufficient.

---

## YAGNI — You Aren't Gonna Need It

Do not implement speculative requirements.

Avoid:

- unused extension points;
- hypothetical provider abstractions;
- configuration for things that never vary;
- generic frameworks built for a single use case.

Design for known change, not every imaginable change.

---

## Principle of Least Astonishment

APIs and code should behave the way a reasonable developer would expect.

Names, return types, side effects, error behavior, and conventions should be unsurprising.

---

## Separation of Concerns

Keep distinct concerns separate:

- business rules;
- persistence;
- transport;
- serialization;
- authentication;
- authorization;
- presentation;
- infrastructure;
- configuration;
- observability.

Separation does not require one class per concern. Avoid excessive fragmentation.

---

## Law of Demeter

A component should know as little as practical about the internal structure of other components.

Prefer:

```text
order.cancel()
```

over:

```text
order.customer.account.subscription.cancel()
```

when the deeper traversal leaks implementation details.

---

## Tell, Don't Ask

Prefer asking objects or modules to perform meaningful behavior instead of retrieving their internal state and making decisions elsewhere.

Use pragmatically; pure data structures and functional designs may favor explicit transformations.

---

## Favor Composition Over Inheritance

Inheritance tightly couples subclasses to parent implementation details.

Prefer composition when behavior can be assembled from smaller capabilities.

Use inheritance primarily when there is a genuine stable "is-a" relationship and substitutability is preserved.

---

## Encapsulate What Varies

Identify dimensions likely to change and isolate them behind narrow interfaces.

Common examples:

- payment providers;
- storage implementations;
- notification channels;
- serialization formats;
- authentication mechanisms;
- pricing policies.

Do not isolate things merely because they *could* change.

---

# 4. Gang of Four Design Patterns

Patterns are vocabulary for recurring design problems. They are not goals.

Use a pattern when it makes the design simpler to understand or change.

---

## Creational Patterns

### Factory Method

Delegate object creation to a method or subtype.

Use when:

- creation logic varies;
- callers should not know concrete implementation details.

Avoid when a normal constructor is sufficient.

---

### Abstract Factory

Create related families of objects through a common abstraction.

Use when:

- implementations come in compatible families;
- platform/provider-specific components must remain consistent.

Examples:

- cloud-provider adapters;
- UI widget families;
- database-specific components.

---

### Builder

Construct complex objects incrementally.

Use when:

- constructors have many optional parameters;
- construction has multiple steps;
- readability benefits from named configuration.

Avoid builders for simple objects.

---

### Prototype

Create objects by cloning an existing prototype.

Useful when object initialization is expensive or configurations are template-driven.

Often unnecessary in languages where copying immutable values is easy.

---

### Singleton

Ensure a single instance and provide global access.

Use sparingly.

Potential problems:

- hidden global state;
- test interference;
- initialization order;
- concurrency issues;
- tight coupling.

Prefer dependency injection and explicit lifecycle management.

---

## Structural Patterns

### Adapter

Convert one interface into another expected by the consumer.

Ideal for:

- third-party SDKs;
- legacy systems;
- infrastructure boundaries.

Adapters keep external details out of core application code.

---

### Bridge

Separate an abstraction from its implementation so both can vary independently.

Useful when two dimensions vary independently, such as:

```text
Notification Type × Delivery Channel
```

---

### Composite

Represent individual objects and groups uniformly.

Useful for:

- trees;
- nested UI elements;
- file systems;
- organizational hierarchies;
- expression trees.

---

### Decorator

Add behavior by wrapping an object without modifying it.

Useful for:

- logging;
- retries;
- caching;
- authorization;
- metrics.

Be cautious with long decorator chains that obscure control flow.

---

### Facade

Provide a simple interface over a complex subsystem.

Use to:

- reduce coupling;
- create a stable entry point;
- hide coordination details.

---

### Flyweight

Share common immutable state across many objects to reduce memory usage.

Use only when profiling shows large numbers of similar objects causing meaningful memory cost.

---

### Proxy

Stand in for another object while controlling access.

Common uses:

- lazy loading;
- remote calls;
- caching;
- authorization;
- tracing.

Make network or expensive behavior visible when possible; avoid surprising "local-looking" APIs that secretly perform remote work.

---

## Behavioral Patterns

### Chain of Responsibility

Pass a request through a sequence of handlers until one handles it.

Useful for:

- middleware;
- request processing;
- validation pipelines.

Ensure ordering is explicit and observable.

---

### Command

Represent an operation as a value/object.

Useful for:

- queues;
- undo/redo;
- auditability;
- delayed execution;
- job processing.

Commands should contain intent, not arbitrary implementation leakage.

---

### Interpreter

Represent grammar rules as objects and evaluate expressions.

Useful for small domain-specific languages.

For complex grammars, prefer parser tooling.

---

### Iterator

Traverse a collection without exposing internal representation.

Most modern languages provide this natively.

---

### Mediator

Centralize communication between collaborating components.

Useful when many components otherwise depend directly on one another.

Avoid creating a "god mediator."

---

### Memento

Capture state so it can later be restored without exposing internals.

Useful for:

- undo;
- snapshots;
- workflow restoration.

---

### Observer

Notify subscribers when state or events change.

Useful for:

- domain events;
- UI updates;
- integration events.

Risks:

- hidden control flow;
- event ordering;
- accidental recursion;
- difficult debugging.

Prefer explicit event schemas and tracing.

---

### State

Represent state-dependent behavior using distinct state objects or explicit state machines.

Use when behavior changes substantially by state.

For workflows, prefer explicit finite-state transitions over scattered boolean flags.

---

### Strategy

Encapsulate interchangeable algorithms behind a common interface.

Useful for:

- pricing;
- ranking;
- routing;
- retries;
- validation policies.

One of the most broadly useful patterns.

---

### Template Method

Define an algorithm skeleton in a base implementation while allowing selected steps to vary.

Prefer composition/strategy when inheritance would tightly couple implementations.

---

### Visitor

Add operations across a stable object structure without modifying each type.

Useful for:

- compilers;
- AST processing;
- complex object graphs.

Avoid when the object hierarchy changes frequently.

---

# 5. GRASP Principles

## Information Expert

Assign responsibility to the component that has the information necessary to fulfill it.

## Creator

A component should create another when it closely owns, contains, records, or aggregates it.

## Controller

Use a controller/use-case/application service to coordinate system operations rather than placing orchestration in UI or infrastructure code.

## Low Coupling

Minimize unnecessary dependencies between modules.

## High Cohesion

Keep related behavior together.

## Polymorphism

Use polymorphism when behavior genuinely varies by type.

## Pure Fabrication

Introduce a service or helper when doing so improves cohesion and reduces coupling even if the abstraction is not a domain concept.

## Indirection

Use intermediaries to decouple components when the benefit exceeds the added complexity.

## Protected Variations

Place unstable or externally controlled behavior behind stable interfaces.

---

# 6. 12-Factor App Principles

These principles are especially relevant to deployable services.

## I. Codebase

One codebase tracked in version control, with many deployments.

Avoid copying source trees to create environment variants.

---

## II. Dependencies

Explicitly declare and isolate dependencies.

Do not rely on undeclared system-wide packages.

Use lockfiles where appropriate.

---

## III. Config

Store deployment-specific configuration in the environment or equivalent external configuration mechanism.

Do not commit:

- passwords;
- API keys;
- credentials;
- environment-specific secrets.

Separate configuration from code.

---

## IV. Backing Services

Treat databases, queues, caches, email systems, and external APIs as attached resources.

Access them through configuration so implementations can be replaced without rewriting business logic.

---

## V. Build, Release, Run

Keep these stages distinct.

```text
Source -> Build -> Release -> Run
```

A release should combine an immutable build artifact with environment-specific configuration.

---

## VI. Processes

Run the application as stateless processes when practical.

Durable state belongs in backing services.

Do not rely on local process memory or filesystem state surviving restarts.

---

## VII. Port Binding

Services should expose themselves through an explicit network port rather than depending on a separately configured application server where possible.

---

## VIII. Concurrency

Scale by adding process instances rather than relying only on larger single processes.

Separate workloads by process type where useful:

```text
web
worker
scheduler
consumer
```

---

## IX. Disposability

Processes should start quickly and shut down gracefully.

Handle:

- termination signals;
- in-flight work;
- connection cleanup;
- idempotent retries.

---

## X. Dev/Prod Parity

Keep development, staging, and production environments reasonably similar.

Reduce differences in:

- backing services;
- deployment mechanism;
- dependency versions;
- operational behavior.

---

## XI. Logs

Treat logs as event streams.

Applications should emit structured logs and let the execution environment route, store, and aggregate them.

Avoid managing log files directly inside application code.

---

## XII. Admin Processes

Run administrative tasks as one-off processes using the same code and configuration as the application.

Examples:

- migrations;
- data repair;
- backfills;
- maintenance commands.

---

# 7. Architecture Principles

## Clean Architecture / Hexagonal Architecture

Keep business rules independent of infrastructure.

A useful conceptual structure:

```text
Domain
  ^
Application / Use Cases
  ^
Ports / Interfaces
  ^
Adapters
  ^
Frameworks / Infrastructure
```

Dependencies should point inward toward stable policy.

### Domain

Contains:

- entities;
- value objects;
- invariants;
- domain services;
- domain events.

Should normally avoid dependencies on:

- web frameworks;
- database ORMs;
- cloud SDKs;
- UI libraries.

### Application layer

Coordinates use cases and transactions.

It answers:

> What does the system do?

rather than:

> How is the database or HTTP framework implemented?

### Adapters

Translate between the application and external systems.

Examples:

- REST controllers;
- CLI handlers;
- database repositories;
- queue consumers;
- third-party API adapters.

---

## Modular Monolith First

When requirements do not demand independent deployment, prefer a well-structured modular monolith over microservices.

Microservices introduce:

- network failure;
- distributed tracing;
- service discovery;
- deployment coordination;
- schema evolution;
- eventual consistency;
- distributed authorization;
- operational overhead.

Split services when there is evidence for independent scaling, ownership, lifecycle, reliability boundaries, or deployment requirements.

---

## Bounded Contexts

When using Domain-Driven Design, model business concepts within explicit boundaries.

A term may legitimately mean different things in different contexts.

Avoid creating a single global domain model for unrelated business capabilities.

---

# 8. Domain-Driven Design

Use DDD when the domain contains significant business complexity.

## Entity

Has identity that persists over time.

Example:

```text
Customer(id)
Order(id)
Account(id)
```

---

## Value Object

Defined by its value rather than identity.

Examples:

```text
Money(amount, currency)
EmailAddress(value)
DateRange(start, end)
```

Prefer immutable value objects where practical.

---

## Aggregate

A consistency boundary around related domain objects.

Only the aggregate root should normally be modified directly by external callers.

Keep aggregates small.

---

## Repository

Provides collection-like access to aggregates while hiding persistence details.

Repositories should represent domain access patterns, not expose arbitrary database mechanics.

---

## Domain Service

Contains domain logic that does not naturally belong to one entity or value object.

Do not use "service" as a dumping ground.

---

## Domain Event

Represents something meaningful that happened in the domain.

Use past-tense names:

```text
OrderPlaced
PaymentCaptured
SubscriptionCanceled
```

Distinguish domain events from integration events where appropriate.

---

# 9. API Design

## General rules

- Make APIs consistent.
- Use meaningful resource and operation names.
- Validate input.
- Return useful errors.
- Avoid leaking implementation details.
- Maintain backward compatibility unless intentionally versioning.
- Make side effects clear.
- Document idempotency expectations.

---

## Idempotency

Operations that may be retried should be idempotent when feasible.

Examples:

- payment requests using idempotency keys;
- message handlers tracking processed message IDs;
- PUT-style replacement operations.

---

## Pagination

Never assume collections remain small.

Use cursor-based pagination when stable traversal over changing datasets is important.

---

## Error responses

Errors should be useful to both callers and operators.

Include:

- stable error code;
- human-readable message;
- relevant context;
- correlation/request ID where applicable.

Do not expose secrets, stack traces, or sensitive internals to external callers.

---

# 10. Data and Persistence

## Transactions

Use transactions to protect explicit consistency boundaries.

Keep transactions short.

Avoid holding a database transaction open across slow network calls.

---

## Schema migrations

Migrations should be:

- version controlled;
- repeatable in deployment workflows;
- backward compatible during rolling deployments where required.

Prefer expand-and-contract changes:

1. Add compatible schema.
2. Deploy code supporting both versions.
3. Migrate data.
4. Remove old behavior.
5. Remove obsolete schema.

---

## Database constraints

Enforce important invariants in the database when possible.

Use:

- primary keys;
- foreign keys;
- unique constraints;
- non-null constraints;
- check constraints.

Application validation complements database constraints; it does not replace them.

---

## N+1 Queries

Watch for loops that cause one database query per item.

Use appropriate joins, batching, preloading, or data-loader techniques.

Optimize based on measured query behavior.

---

# 11. Distributed Systems Principles

## Assume failure

Networks fail.

Dependencies:

- time out;
- return errors;
- become slow;
- return malformed data;
- partially succeed.

Design failure behavior explicitly.

---

## Timeouts

Every network call should normally have a bounded timeout.

Never rely on infinite/default waits without understanding their behavior.

---

## Retries

Retry only when an operation is safe or idempotent.

Use:

- bounded retry counts;
- exponential backoff;
- jitter.

Do not retry permanent failures.

---

## Circuit Breakers

Use circuit breakers when repeated calls to an unhealthy dependency can amplify failure.

They are useful but add state and complexity; apply where justified.

---

## Bulkheads

Isolate resource pools so failure in one workload does not consume all system capacity.

Examples:

- separate thread/connection pools;
- separate worker queues;
- concurrency limits.

---

## Eventual Consistency

In distributed systems, immediate consistency across services is often impractical.

Make eventual consistency visible in the model and UX rather than pretending operations are atomic.

---

## At-Least-Once Delivery

Many queues can deliver a message more than once.

Consumers should normally be idempotent.

Do not assume "exactly once" unless the entire end-to-end system truly guarantees it.

---

# 12. Concurrency

Prefer designs that minimize shared mutable state.

Use:

- immutability;
- message passing;
- ownership;
- transactions;
- synchronization primitives where required.

Be explicit about:

- race conditions;
- ordering;
- atomicity;
- visibility;
- deadlocks.

Never assume asynchronous operations complete in creation order.

---

# 13. Testing Strategy

Tests should provide confidence at the lowest reasonable maintenance cost.

## Testing pyramid

Favor:

1. many fast unit tests;
2. fewer integration tests;
3. targeted end-to-end tests.

Do not interpret the pyramid rigidly. Test at the boundary that best validates meaningful behavior.

---

## Unit tests

Test isolated domain behavior and pure logic.

Good unit tests:

- are fast;
- are deterministic;
- test observable behavior;
- avoid excessive mocking.

---

## Integration tests

Use integration tests for:

- database behavior;
- serialization;
- framework wiring;
- external-service adapters;
- message brokers;
- transactions.

Prefer testing against realistic infrastructure when feasible.

---

## End-to-end tests

Use for high-value critical flows.

Avoid testing every permutation through slow UI or full-system tests.

---

## Test behavior, not implementation details

A refactor that preserves behavior should not require rewriting most tests.

Avoid asserting private method calls or internal sequencing unless that sequencing is itself required behavior.

---

## Arrange / Act / Assert

Structure tests clearly:

```text
Arrange
Act
Assert
```

One test may have multiple assertions if they collectively validate one behavior.

---

## Test determinism

Avoid tests dependent on:

- wall clock time;
- random values;
- network availability;
- global mutable state;
- execution order.

Inject clocks, random sources, IDs, and external dependencies where useful.

---

# 14. Observability

A production system should answer:

- What happened?
- Where did it happen?
- Why did it happen?
- Who or what was affected?
- How often is it happening?

## Logs

Prefer structured logs.

Include useful context such as:

- request ID;
- trace ID;
- operation;
- entity identifiers where safe;
- duration;
- result.

Never log secrets or sensitive data unnecessarily.

---

## Metrics

Track system health and business health.

Common service metrics:

- request rate;
- error rate;
- latency;
- saturation.

Use percentiles for latency, not only averages.

---

## Tracing

Distributed tracing helps identify cross-service latency and failure propagation.

Propagate correlation/trace context across boundaries.

---

# 15. Security Principles

## Least Privilege

Grant only the minimum permissions required.

Applies to:

- users;
- services;
- databases;
- cloud roles;
- CI/CD;
- filesystem access.

---

## Defense in Depth

Do not rely on a single security control.

Combine:

- authentication;
- authorization;
- input validation;
- network controls;
- encryption;
- auditing;
- rate limits.

---

## Validate at Trust Boundaries

Treat data from users, files, networks, queues, databases, and third parties according to its trust level.

Validate:

- type;
- format;
- size;
- range;
- allowed values.

---

## Authentication vs Authorization

Authentication answers:

> Who are you?

Authorization answers:

> Are you allowed to do this?

Do not conflate them.

Perform authorization server-side at the point where protected actions occur.

---

## Secrets

Never:

- hard-code secrets;
- commit secrets;
- log secrets;
- return secrets in API errors.

Use an approved secret-management mechanism.

---

## Injection Prevention

Use parameterized queries and safe APIs.

Never concatenate untrusted input into:

- SQL;
- shell commands;
- HTML;
- templates;
- LDAP;
- paths;
- interpreter expressions.

---

## Secure Defaults

Default to:

- deny rather than allow;
- private rather than public;
- encrypted rather than plaintext;
- least privilege rather than broad access.

---

# 16. Reliability and Resilience

## Graceful Degradation

When a noncritical dependency fails, preserve core functionality where reasonable.

Example:

A recommendation engine outage should not necessarily prevent checkout.

---

## Fail Fast

Detect invalid configuration and unrecoverable preconditions early.

Do not allow corrupted state to propagate silently.

---

## Backpressure

Systems receiving work faster than they can process it need explicit load control.

Options include:

- queue limits;
- concurrency limits;
- rate limiting;
- load shedding;
- bounded buffers.

---

## Health Checks

Distinguish where useful:

- **liveness** — should the process be restarted?
- **readiness** — can it serve traffic?
- **startup** — has initialization completed?

Avoid health checks that create expensive dependency storms.

---

# 17. Performance Principles

## Measure First

Do not optimize based on intuition alone.

Use:

- profiling;
- tracing;
- metrics;
- query plans;
- benchmarks.

---

## Complexity Awareness

Understand algorithmic complexity for hot paths and large inputs.

Common concerns:

```text
O(1)
O(log n)
O(n)
O(n log n)
O(n²)
```

Avoid accidental quadratic behavior on unbounded collections.

---

## Caching

Caching trades freshness and complexity for performance.

Before adding a cache, define:

- what is cached;
- cache key;
- TTL;
- invalidation strategy;
- consistency expectations;
- memory/storage limits;
- stampede behavior.

If invalidation cannot be explained clearly, reconsider the cache design.

---

# 18. Configuration and Feature Flags

Configuration should represent deployment/runtime choices.

Do not turn every constant into configuration.

Feature flags are useful for:

- gradual rollout;
- canary testing;
- operational kill switches;
- temporary migration paths.

Remove stale flags after rollout completes.

Long-lived flags create hidden branches and testing complexity.

---

# 19. Dependency Management

Before adding a dependency, ask:

- Is the functionality difficult to implement safely?
- Is the library maintained?
- Is its license acceptable?
- What is its security history?
- What transitive dependencies does it introduce?
- Is its API stable?
- Does the project already contain an equivalent dependency?

Prefer standard-library functionality for small/simple needs.

Pin or lock versions according to ecosystem best practices.

---

# 20. Refactoring Principles

Refactoring changes structure without intentionally changing externally observable behavior.

Prefer small, reviewable steps.

Useful techniques:

- extract function;
- extract class/module;
- rename for intent;
- replace conditionals with strategy/state where justified;
- introduce value objects;
- isolate side effects;
- move behavior toward the data it operates on.

Add characterization tests before changing poorly understood legacy behavior.

---

# 21. Code Review Guidelines

When reviewing code, examine:

## Correctness

- Does it satisfy the requested behavior?
- Are edge cases handled?
- Are invariants maintained?

## Design

- Is the abstraction simpler than the problem?
- Does responsibility live in the right place?
- Is coupling reasonable?
- Is duplication of knowledge introduced?

## Security

- Are trust boundaries validated?
- Are permissions correct?
- Is sensitive information protected?

## Reliability

- What happens when dependencies fail?
- Are timeout/retry semantics correct?
- Is the operation idempotent where required?

## Testing

- Are important behaviors tested?
- Are tests stable and meaningful?

## Operations

- Are logs/metrics sufficient?
- Can failures be diagnosed?
- Are migrations/deployment concerns handled?

## Maintainability

- Will another engineer understand this in six months?
- Are names meaningful?
- Is accidental complexity being introduced?

---

# 22. AI Coding Agent Operating Rules

When modifying an existing repository:

1. **Inspect before editing.**
   - Understand repository structure.
   - Read nearby code.
   - Identify existing conventions.
   - Check tests and configuration.

2. **Preserve architecture unless improvement is necessary.**
   - Do not introduce a new architectural style for a local change.
   - Match existing patterns unless they create a correctness, security, or maintainability problem.

3. **Minimize the change surface.**
   - Change only what is needed.
   - Avoid unrelated cleanup unless it materially reduces risk.

4. **Reuse existing abstractions.**
   - Search for similar logic before creating new helpers, services, models, or utilities.

5. **Do not over-engineer.**
   - Avoid speculative interfaces, factories, registries, plugin systems, or generalized frameworks.

6. **Keep boundaries clean.**
   - Domain logic should not leak into controllers or persistence code.
   - Infrastructure concerns should stay near infrastructure boundaries.

7. **Treat external input as untrusted.**
   - Validate at boundaries.
   - Avoid unsafe parsing and command construction.

8. **Handle failure explicitly.**
   - Think about timeouts, retries, partial failure, invalid state, and concurrency.

9. **Write or update tests.**
   - Test behavior changed by the modification.
   - Prefer deterministic tests.

10. **Maintain backward compatibility unless explicitly allowed to break it.**

11. **Update documentation when behavior, interfaces, configuration, or operations change.**

12. **Do not silently suppress errors.**
   - Either handle, transform, propagate, or record them intentionally.

13. **Avoid broad exception catches unless adding meaningful handling.**

14. **Prefer explicit dependencies.**
   - Avoid hidden globals and service locators.

15. **Verify assumptions against the repository.**
   - Do not invent APIs, files, schemas, environment variables, or conventions.

---

# 23. Decision Checklist for New Abstractions

Before introducing an abstraction, ask:

- What concrete duplication or variation does this solve?
- Are there at least two meaningful implementations or callers?
- Does the abstraction simplify the caller?
- Is the interface smaller and more stable than the implementations?
- Could a simple function or module solve the same problem?
- Will a future maintainer understand why this abstraction exists?

If the answers are weak, keep the design concrete.

---

# 24. Decision Checklist for Design Patterns

Before using a named pattern:

1. What specific problem exists?
2. Is this problem recurring or likely to recur?
3. Does the pattern reduce coupling or complexity?
4. Is there a simpler language-native solution?
5. Will the pattern make the code easier to navigate?
6. Does it fit existing repository conventions?

Never implement a pattern merely to demonstrate the pattern.

---

# 25. Practical Priority Order

When principles conflict, use judgment.

A useful default priority is:

```text
Correctness
  > Security
  > Data integrity
  > Reliability
  > Clarity
  > Maintainability
  > Testability
  > Operability
  > Performance
  > Elegance
  > Pattern purity
```

This ordering is contextual, not absolute.

---

# 26. Common Anti-Patterns

Avoid or scrutinize:

- God Object / God Service
- Big Ball of Mud
- Spaghetti Code
- Circular Dependencies
- Shotgun Surgery
- Feature Envy
- Primitive Obsession
- Boolean Flag Explosion
- Magic Strings / Magic Numbers
- Hidden Global State
- Service Locator
- Anemic abstractions with no meaningful behavior
- Excessive inheritance
- Over-generalized frameworks
- Premature optimization
- Premature microservices
- Shared databases between independently owned services
- Distributed transactions without strong justification
- Swallowed exceptions
- Infinite retries
- Unbounded queues
- Unbounded concurrency
- N+1 queries
- Chatty network APIs
- Secrets in source control
- Business logic in controllers
- Business logic in ORM hooks without clear justification
- Tests coupled to implementation details

---

# 27. Recommended Design Workflow

For nontrivial changes:

```text
1. Understand requirements and invariants
2. Inspect existing architecture and conventions
3. Identify trust and system boundaries
4. Model the simplest viable design
5. Identify failure modes
6. Define interfaces only where useful
7. Implement core behavior
8. Add automated tests
9. Add observability
10. Validate security and failure handling
11. Measure performance if relevant
12. Document meaningful decisions
```

---

# 28. Architecture Decision Records

For consequential decisions, record:

```markdown
# ADR: <decision>

## Context
What problem or constraint requires a decision?

## Decision
What are we choosing?

## Alternatives Considered
What other realistic options were evaluated?

## Consequences
What trade-offs follow from this choice?

## Status
Proposed / Accepted / Deprecated / Superseded
```

Use ADRs for decisions that future maintainers may otherwise reverse without understanding the original constraints.

---

# 29. Final Guidance

Patterns and principles are tools for reasoning.

Do not optimize for:

- maximum abstraction;
- maximum pattern usage;
- theoretical purity.

Optimize for software that is:

- correct;
- secure;
- understandable;
- changeable;
- testable;
- operable;
- resilient.

When uncertain, prefer the design with fewer moving parts and clearer boundaries.
