package demo.tx;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** oracle: tx-two-args — POSITIVE. Unique name/arity (2) target. */
@Service
public class TxTwoArgsCase {

    public void submit(String payload, String note) {
        this.save(payload, note);
    }

    @Transactional
    public void save(String payload, String note) {
    }
}
