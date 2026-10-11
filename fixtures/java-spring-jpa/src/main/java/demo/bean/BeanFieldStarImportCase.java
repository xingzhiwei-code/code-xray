package demo.bean;

import org.springframework.stereotype.Service;
import org.springframework.stereotype.*;

/** oracle: bean-field-star-import — UNKNOWN. Injected bean's @Component resolved only via wildcard import. */
@Service
public class BeanFieldStarImportCase {

    private FieldStarHelper helper;

    public void run() {
    }
}

@Component
class FieldStarHelper {
}
