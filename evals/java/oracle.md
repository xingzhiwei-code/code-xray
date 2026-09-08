# Frozen rule oracle — v1, fixed before implementation (2026-09-08)

Owner: implementation agent, independently specified from source patterns and official mechanisms; no claim of external Java-expert validation. Checker must inspect source labels independently before release. These are syntactic applicability labels, not runtime fault labels.

Rule TX_SELF_INVOCATION: same top-level class, unique name/arity target annotated with explicit Spring Transactional import/FQN, direct unqualified or this call from another method. Positive means proxy-boundary checkpoint; it never proves rollback failure. No transaction annotation, another receiver, homonymous non-Spring annotation, and string/comment are negative. Star-import and same-arity overload ambiguity are unknown.

Rule JPA_CALL_IN_LOOP: simple field receiver whose declared type resolves directly to a local interface extending explicitly imported/FQN JpaRepository, CrudRepository or ListCrudRepository, with supported query/write method call syntactically under for/while/do body. Positive means repeated persistence-call shape; does not prove SQL count/N+1. Outside loop, non-repository type, strings/comments, shadowing parameter non-repository are negative. Unknown external repository type and deferred lambda are unknown.

Rule WEB_ENTITY_RELATION: Spring RestController or Controller+ResponseBody method mapping explicitly imported/FQN; response declared type is local JPA Entity carrying explicitly imported/FQN relationship field; direct entity or supported List/ResponseEntity wrappers. Positive means response-boundary checkpoint; no serialization/leak claim. DTO, entity without relationship, no mapping, plain Controller HTML method are negative. Unknown external entity and unresolved wildcard Entity annotation are unknown.

| Rule | Positive IDs (4) | Negative IDs (4) | Unknown IDs (2) |
|---|---|---|---|
| TX_SELF_INVOCATION | tx-unqualified, tx-this, tx-fqn, tx-two-args | tx-no-annotation, tx-other-receiver, tx-custom-annotation, tx-string-comment | tx-star-import, tx-overload |
| JPA_CALL_IN_LOOP | loop-for, loop-while, loop-do, loop-this | loop-outside, loop-plain-type, loop-string, loop-shadowed | loop-external, loop-lambda |
| WEB_ENTITY_RELATION | web-direct, web-list, web-response, web-controller-body | web-dto, web-no-relation, web-no-mapping, web-html | web-external, web-star-entity |

Sources: [Spring transaction proxy/self-invocation](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html), [Spring Data query methods](https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html), [Jakarta Persistence entity relationships and fetch semantics](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2), [Spring MVC ResponseBody](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/responsebody.html).

Unknown inputs are excluded from precision/recall denominators and reported separately. Known denominators: 12 positives + 12 negatives. Any unknown input reported as a finding fails its boundary test. Labels stay fixed if an implementation fails.
