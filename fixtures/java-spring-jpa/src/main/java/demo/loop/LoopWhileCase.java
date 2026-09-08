package demo.loop;

import java.util.Iterator;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;

/** oracle: loop-while — POSITIVE. Repository write inside a while loop. */
@Service
public class LoopWhileCase {

    private final LoopWhileOrderRepository orderRepository;

    public LoopWhileCase(LoopWhileOrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    public void drain(List<LoopWhileOrder> orders) {
        Iterator<LoopWhileOrder> it = orders.iterator();
        while (it.hasNext()) {
            orderRepository.save(it.next());
        }
    }
}

interface LoopWhileOrderRepository extends JpaRepository<LoopWhileOrder, Long> {
}

class LoopWhileOrder {
}
