package demo.jpacontext;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;

/** oracle: jpacontext-manytoone — POSITIVE. Method returns an entity with a @ManyToOne relation. */
public class JpacontextManyToOneCase {

    public ManyLineEntity fetch() {
        return new ManyLineEntity();
    }
}

@Entity
class ManyLineEntity {

    @Id
    private Long id;

    @ManyToOne
    private ManyOrderEntity order;
}

@Entity
class ManyOrderEntity {

    @Id
    private Long id;
}
