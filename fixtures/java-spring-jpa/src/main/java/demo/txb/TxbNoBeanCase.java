package demo.txb;

import org.springframework.transaction.annotation.Transactional;

/** oracle: txb-no-bean — NEGATIVE. @Transactional method on a non-bean class. */
public class TxbNoBeanCase {

    @Transactional
    public void run() {
    }
}
