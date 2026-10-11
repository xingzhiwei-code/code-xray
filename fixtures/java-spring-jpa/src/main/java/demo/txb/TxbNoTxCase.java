package demo.txb;

import org.springframework.stereotype.Service;

/** oracle: txb-no-tx — NEGATIVE. @Service method without @Transactional. */
@Service
public class TxbNoTxCase {

    public void run() {
    }
}
