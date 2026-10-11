package demo.jpacontext;

import jakarta.persistence.*;
import java.util.List;

/** oracle: jpacontext-star-entity — UNKNOWN. @Entity resolved only via wildcard import. */
public class JpacontextStarEntityCase {

    public StarEntEntity fetch() {
        return new StarEntEntity();
    }
}

@Entity
class StarEntEntity {

    @Id
    private Long id;

    @OneToMany
    private List<StarEntItemEntity> items;
}

@Entity
class StarEntItemEntity {

    @Id
    private Long id;
}
