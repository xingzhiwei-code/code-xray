package demo.jpacontext;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import java.util.List;

/** oracle: jpacontext-direct — POSITIVE. Method returns an entity with a @OneToMany relation. */
public class JpacontextDirectCase {

    public DirectOrderEntity fetch() {
        return new DirectOrderEntity();
    }
}

@Entity
class DirectOrderEntity {

    @Id
    private Long id;

    @OneToMany
    private List<DirectItemEntity> items;
}

@Entity
class DirectItemEntity {

    @Id
    private Long id;
}
