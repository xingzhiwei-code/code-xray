package demo.txb;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** oracle: txb-service — POSITIVE. @Service method with @Transactional. */
@Service
public class TxbServiceCase {

    @Transactional
    public void run() {
    }
}
