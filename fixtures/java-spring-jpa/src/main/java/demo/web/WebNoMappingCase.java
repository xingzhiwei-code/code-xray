package demo.web;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.RestController;

/** oracle: web-no-mapping — NEGATIVE. RestController entity method without a mapping annotation. */
@RestController
public class WebNoMappingCase {

    public WebNoMappingOrder build() {
        return new WebNoMappingOrder();
    }
}

@Entity
class WebNoMappingOrder {

    @Id
    private Long id;

    @OneToMany
    private List<WebNoMappingLine> lines = new ArrayList<>();
}

class WebNoMappingLine {
}
