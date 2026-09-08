package demo.tx;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;

/** oracle: tx-star-import — UNKNOWN. Annotation identity not resolvable from a wildcard import. */
@Service
public class TxStarImportCase {

    public void submit(String payload) {
        save(payload);
    }

    @Transactional
    public void save(String payload) {
    }
}
