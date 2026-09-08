package demo.tx;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** oracle: tx-unqualified — POSITIVE. Unqualified self call into @Transactional target. */
@Service
public class TxUnqualifiedCase {

    public void submit(String payload) {
        save(payload);
    }

    @Transactional
    public void save(String payload) {
    }
}
