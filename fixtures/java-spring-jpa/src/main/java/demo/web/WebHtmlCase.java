package demo.web;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** oracle: web-html — NEGATIVE. Plain Controller method; HTML view path, no ResponseBody. */
@Controller
public class WebHtmlCase {

    @GetMapping("/web-html")
    public WebHtmlOrder show() {
        return new WebHtmlOrder();
    }
}

@Entity
class WebHtmlOrder {

    @Id
    private Long id;

    @OneToMany
    private List<WebHtmlLine> lines = new ArrayList<>();
}

class WebHtmlLine {
}
