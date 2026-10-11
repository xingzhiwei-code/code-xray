package demo.bean;

import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;

/** oracle: bean-multi-inject — POSITIVE. @Service injecting two bean candidates. */
@Service
public class BeanMultiInjectCase {

    private FirstBean first;
    private SecondBean second;

    public void run() {
    }
}

@Component
class FirstBean {
}

@Component
class SecondBean {
}
