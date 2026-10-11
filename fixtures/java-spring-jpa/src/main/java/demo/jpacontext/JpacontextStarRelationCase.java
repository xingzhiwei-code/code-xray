package demo.jpacontext;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.*;
import java.util.List;

/** oracle: jpacontext-star-relation — UNKNOWN. @OneToMany resolved only via wildcard import. */
public class JpacontextStarRelationCase {

    public RelStarEntity fetch() {
        return new RelStarEntity();
    }
}

@Entity
class RelStarEntity {

    @Id
    private Long id;

    @OneToMany
    private List<RelStarItemEntity> items;
}

@Entity
class RelStarItemEntity {

    @Id
    private Long id;
}
