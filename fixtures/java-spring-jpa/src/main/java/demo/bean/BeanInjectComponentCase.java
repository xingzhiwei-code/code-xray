package demo.bean;

import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;

/** oracle: bean-inject-component — POSITIVE. @Service injecting a @Component bean. */
@Service
public class BeanInjectComponentCase {

    private HelperComponent helper;

    public void run() {
    }
}

@Component
class HelperComponent {
}
