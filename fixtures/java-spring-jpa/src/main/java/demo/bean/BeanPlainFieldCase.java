package demo.bean;

import org.springframework.stereotype.Service;

/** oracle: bean-plain-field — NEGATIVE. @Service field of a non-bean type. */
@Service
public class BeanPlainFieldCase {

    private PlainHelper helper;

    public void run() {
    }
}

class PlainHelper {
}
