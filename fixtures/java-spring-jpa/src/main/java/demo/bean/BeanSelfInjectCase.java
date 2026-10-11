package demo.bean;

import org.springframework.stereotype.Service;

/** oracle: bean-self-inject — NEGATIVE. @Service field typed as itself. */
@Service
public class BeanSelfInjectCase {

    private BeanSelfInjectCase self;

    public void run() {
    }
}
