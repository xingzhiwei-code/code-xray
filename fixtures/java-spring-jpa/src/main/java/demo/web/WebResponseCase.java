package demo.web;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import java.util.ArrayList;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** oracle: web-response — POSITIVE. ResponseEntity wrapper around a related entity. */
@RestController
public class WebResponseCase {

    @GetMapping("/web-response")
    public ResponseEntity<WebResponseOrder> show() {
        return ResponseEntity.ok(new WebResponseOrder());
    }
}

@Entity
class WebResponseOrder {

    @Id
    private Long id;

    @OneToMany
    private List<WebResponseLine> lines = new ArrayList<>();
}

class WebResponseLine {
}
