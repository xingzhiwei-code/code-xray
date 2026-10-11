package demo.bean;

import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.RestController;

/** oracle: bean-controller-service — POSITIVE. @RestController injecting a @Service bean. */
@RestController
public class BeanControllerServiceCase {

    private ControllerServiceHelper helper;

    public void run() {
    }
}

@Service
class ControllerServiceHelper {
}
