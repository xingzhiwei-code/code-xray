package demo.web;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

/** oracle: web-controller-body — POSITIVE. Controller + ResponseBody mapping returns entity. */
@Controller
public class WebControllerBodyCase {

    @GetMapping("/web-controller-body")
    @ResponseBody
    public WebControllerBodyOrder show() {
        return new WebControllerBodyOrder();
    }
}

@Entity
class WebControllerBodyOrder {

    @Id
    private Long id;

    @OneToMany
    private List<WebControllerBodyLine> lines = new ArrayList<>();
}

class WebControllerBodyLine {
}
