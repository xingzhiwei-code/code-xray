package demo.jpacontext;

import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import java.util.List;

/** oracle: jpacontext-fqn — POSITIVE. @Entity via fully-qualified name. */
public class JpacontextFqnCase {

    public FqnOrderEntity fetch() {
        return new FqnOrderEntity();
    }
}

@jakarta.persistence.Entity
class FqnOrderEntity {

    @Id
    private Long id;

    @OneToMany
    private List<FqnItemEntity> items;
}

@jakarta.persistence.Entity
class FqnItemEntity {

    @Id
    private Long id;
}
