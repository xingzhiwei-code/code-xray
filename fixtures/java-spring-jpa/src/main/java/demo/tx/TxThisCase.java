package demo.tx;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** oracle: tx-this — POSITIVE. this-qualified self call into @Transactional target. */
@Service
public class TxThisCase {

    public void submit(String payload) {
        this.save(payload);
    }

    @Transactional
    public void save(String payload) {
    }
}
