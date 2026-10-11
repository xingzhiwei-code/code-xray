package demo.txb;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** oracle: txb-multi — POSITIVE. @Service with two @Transactional methods. */
@Service
public class TxbMultiCase {

    @Transactional
    public void first() {
    }

    @Transactional
    public void second() {
    }
}
