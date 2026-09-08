package demo.tx;

import demo.support.Transactional;
import org.springframework.stereotype.Service;

/** oracle: tx-custom-annotation — NEGATIVE. Transactional name, but NOT the Spring annotation. */
@Service
public class TxCustomAnnotationCase {

    public void submit(String payload) {
        save(payload);
    }

    @Transactional
    public void save(String payload) {
    }
}
