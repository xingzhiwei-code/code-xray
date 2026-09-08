package demo.web;

import java.util.ArrayList;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** oracle: web-dto — NEGATIVE. Response type is a DTO, not a JPA entity. */
@RestController
public class WebDtoCase {

    @GetMapping("/web-dto")
    public WebDtoOrderSummary list() {
        return new WebDtoOrderSummary();
    }
}

class WebDtoOrderSummary {

    private Long id;

    private List<String> itemNames = new ArrayList<>();
}
