package demo.bean;

import org.springframework.stereotype.Service;

/** oracle: bean-inject-service — POSITIVE. @Service injecting another @Service bean. */
@Service
public class BeanInjectServiceCase {

    private InjectServiceHelper helper;

    public void run() {
    }
}

@Service
class InjectServiceHelper {
}
