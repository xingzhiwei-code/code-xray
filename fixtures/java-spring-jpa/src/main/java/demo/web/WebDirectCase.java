package demo.web;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** oracle: web-direct — POSITIVE. RestController returning an entity with relations. */
@RestController
public class WebDirectCase {

    @GetMapping("/web-direct/{id}")
    public WebDirectOrder get(long id) {
        return new WebDirectOrder();
    }
}

@Entity
class WebDirectOrder {

    @Id
    private Long id;

    @OneToMany
    private List<WebDirectLine> lines = new ArrayList<>();
}

class WebDirectLine {
}
