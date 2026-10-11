package demo.txb;

import org.springframework.stereotype.*;
import org.springframework.transaction.annotation.Transactional;

/** oracle: txb-star-bean — UNKNOWN. @Service resolved only via wildcard import. */
@Service
public class TxbStarBeanCase {

    @Transactional
    public void run() {
    }
}
