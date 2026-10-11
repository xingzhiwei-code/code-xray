package demo.txb;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.RestController;

/** oracle: txb-controller — POSITIVE. @RestController method with @Transactional. */
@RestController
public class TxbControllerCase {

    @Transactional
    public void run() {
    }
}
