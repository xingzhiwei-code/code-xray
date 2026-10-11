package demo.jpacontext;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

/** oracle: jpacontext-no-relation — NEGATIVE. Method returns an entity with no relations. */
public class JpacontextNoRelationCase {

    public NoRelEntity fetch() {
        return new NoRelEntity();
    }
}

@Entity
class NoRelEntity {

    @Id
    private Long id;
}
