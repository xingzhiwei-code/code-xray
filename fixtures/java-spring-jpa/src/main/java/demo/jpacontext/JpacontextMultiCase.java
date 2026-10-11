package demo.jpacontext;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import java.util.List;

/** oracle: jpacontext-multi — POSITIVE. Method returns an entity with multiple relations. */
public class JpacontextMultiCase {

    public MultiOrderEntity fetch() {
        return new MultiOrderEntity();
    }
}

@Entity
class MultiOrderEntity {

    @Id
    private Long id;

    @OneToMany
    private List<MultiItemEntity> items;

    @ManyToOne
    private MultiCustomerEntity customer;
}

@Entity
class MultiItemEntity {

    @Id
    private Long id;
}

@Entity
class MultiCustomerEntity {

    @Id
    private Long id;
}
