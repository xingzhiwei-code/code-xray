package demo.txb;

import org.springframework.stereotype.Service;

/** oracle: txb-fqn — POSITIVE. @Transactional via fully-qualified name. */
@Service
public class TxbFqnCase {

    @org.springframework.transaction.annotation.Transactional
    public void run() {
    }
}
