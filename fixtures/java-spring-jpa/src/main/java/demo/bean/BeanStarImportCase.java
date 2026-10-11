package demo.bean;

import org.springframework.stereotype.*;

/** oracle: bean-star-import — UNKNOWN. @Service resolved only via wildcard import. */
@Service
public class BeanStarImportCase {

    private StarImportHelper helper;

    public void run() {
    }
}

@Component
class StarImportHelper {
}
