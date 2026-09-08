package demo.tx;

import org.springframework.stereotype.Service;

/** oracle: tx-fqn — POSITIVE. Target annotation written as a fully qualified name. */
@Service
public class TxFqnCase {

    public void submit(String payload) {
        save(payload);
    }

    @org.springframework.transaction.annotation.Transactional
    public void save(String payload) {
    }
}
