package demo.bean;

import org.springframework.stereotype.Service;

/** oracle: bean-not-bean — NEGATIVE. Plain class (no bean annotation) injecting a @Service field. */
public class BeanNotBeanCase {

    private NotBeanHelper helper;

    public void run() {
    }
}

@Service
class NotBeanHelper {
}
