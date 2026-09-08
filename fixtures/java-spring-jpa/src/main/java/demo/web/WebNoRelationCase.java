package demo.web;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** oracle: web-no-relation — NEGATIVE. Entity response without relationship fields. */
@RestController
public class WebNoRelationCase {

    @GetMapping("/web-no-relation/{id}")
    public WebNoRelationOrder get(long id) {
        return new WebNoRelationOrder();
    }
}

@Entity
class WebNoRelationOrder {

    @Id
    private Long id;

    private String status;
}
