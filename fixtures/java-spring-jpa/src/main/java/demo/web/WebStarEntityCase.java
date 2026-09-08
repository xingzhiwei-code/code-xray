package demo.web;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** oracle: web-star-entity — UNKNOWN. Entity annotation identity unresolved via wildcard import. */
@RestController
public class WebStarEntityCase {

    @GetMapping("/web-star-entity/{id}")
    public WebStarEntityOrder get(long id) {
        return new WebStarEntityOrder();
    }
}

@Entity
class WebStarEntityOrder {

    @Id
    private Long id;

    @OneToMany
    private List<WebStarEntityLine> lines = new ArrayList<>();
}

class WebStarEntityLine {
}
