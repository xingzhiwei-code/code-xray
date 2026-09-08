package demo.web;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** oracle: web-external — UNKNOWN. Response type is external; entity identity unknown. */
@RestController
public class WebExternalCase {

    @GetMapping("/web-external")
    public com.example.external.ExternalOrder show() {
        return null;
    }
}
