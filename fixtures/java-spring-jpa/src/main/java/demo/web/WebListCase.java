package demo.web;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** oracle: web-list — POSITIVE. RestController returning List of related entities. */
@RestController
public class WebListCase {

    @GetMapping("/web-list")
    public List<WebListOrder> list() {
        return new ArrayList<>();
    }
}

@Entity
class WebListOrder {

    @Id
    private Long id;

    @OneToMany
    private List<WebListLine> lines = new ArrayList<>();
}

class WebListLine {
}
